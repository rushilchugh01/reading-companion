import fs from "node:fs/promises";
import { URL } from "node:url";

const endpoint = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:8318/v1";
const model = process.env.LLMWIKI_MODEL ?? process.env.OPENAI_MODEL ?? "gemini-3.1-pro-preview";
const apiKey = process.env.OPENAI_API_KEY ?? "not-needed";
const fixturePath = new URL("../tests/fixtures/playbook-strategy-sample.md", import.meta.url);
const passagePath = process.env.PASSAGE_FILE ?? fixturePath;
const passage = await fs.readFile(passagePath, "utf8");
const chunks = chunkPassage(passage);
const currentChunk = chunks[1] ?? chunks[0];
const previousChunks = chunks.filter((chunk) => chunk.order < currentChunk.order).slice(-2);
const nextChunks = chunks.filter((chunk) => chunk.order > currentChunk.order).slice(0, 1);
const recentChunks = previousChunks.slice(0, 1);

const strategies = [
  {
    id: "single_shot_v1",
    instructions: [
      "Choose one allowed action.",
      "Use currentPassage as the anchor and surroundingPassages only for local context.",
      "Return one ask_question tool call when useful."
    ]
  },
  {
    id: "candidate_ranked_v1",
    instructions: [
      "Use currentPassage as the anchor and surroundingPassages for setup, contrast, and consequences.",
      "Internally generate 3-5 candidate questions.",
      "Classify each by depth.",
      "Reject shallow, ungrounded, or copyable questions.",
      "Return only the best ask_question tool call with question metadata."
    ]
  },
  {
    id: "sketch_then_rank_v1",
    instructions: [
      "Use currentPassage as the anchor.",
      "Silently sketch the local argument from currentPassage and surroundingPassages.",
      "Internally generate 3-5 candidate questions.",
      "Prefer structure, implication, hidden assumption, evidence check, transfer, or connection.",
      "Return only the best ask_question tool call with question metadata."
    ]
  }
];

const results = [];
for (const strategy of strategies) {
  results.push(await evaluateStrategy(strategy));
}

console.log("| Strategy | Question | Expected Answer | Depth | Target Idea | Filter | Note |");
console.log("| --- | --- | --- | --- | --- | --- | --- |");
for (const result of results) {
  console.log([
    result.strategy,
    cleanCell(result.question),
    cleanCell(result.expectedAnswer),
    cleanCell(result.depth),
    cleanCell(result.targetIdea),
    result.filterPass ? "pass" : "fail",
    cleanCell(result.note)
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
}

async function evaluateStrategy(strategy) {
  try {
    const response = await globalThis.fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody(strategy))
    });
    const body = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(body));
    const record = recordFromChoice(body.choices?.[0]?.message ?? {});
    const filterPass = shallowFilterPass(record);
    return {
      strategy: strategy.id,
      question: record.userFacingText ?? record.question ?? "(none)",
      expectedAnswer: record.expectedAnswer ?? "(missing)",
      depth: record.questionDepth ?? "(missing)",
      targetIdea: record.targetIdea ?? "(missing)",
      filterPass,
      note: qualityNote(record)
    };
  } catch (error) {
    return {
      strategy: strategy.id,
      question: "(provider error)",
      expectedAnswer: "",
      depth: "",
      targetIdea: "",
      filterPass: false,
      note: error instanceof Error ? error.message : String(error)
    };
  }
}

function requestBody(strategy) {
  return {
    model,
    temperature: 0.3,
    max_tokens: 700,
    tools: [{
      type: "function",
      function: {
        name: "ask_question",
        description: "Ask one active-reading question.",
        parameters: {
          type: "object",
          properties: {
            userFacingText: { type: "string" },
            expectedAnswer: { type: "string" },
            questionStrategyId: { type: "string" },
            questionDepth: { type: "string" },
            targetIdea: { type: "string" },
            reasoningNeeded: { type: "string" },
            petIntent: { type: "string" },
            reasonForApp: { type: "string" },
            confidence: { type: "number" }
          },
          required: ["userFacingText", "expectedAnswer", "petIntent", "reasonForApp", "confidence"]
        }
      }
    }],
    messages: [{
      role: "system",
      content: [
        "Compose one active-reading intervention for an app-owned reading companion.",
        ...strategy.instructions
      ].join(" ")
    }, {
      role: "user",
      content: JSON.stringify({
        task: "intervention_compose",
        strategyId: strategy.id,
        depthTaxonomy: [
          "recall",
          "explain_why",
          "hidden_assumption",
          "evidence_check",
          "connection",
          "implication",
          "transfer",
          "self_explanation"
        ],
        allowedActions: ["ask_question", "stay_quiet"],
        currentPassage: currentChunk,
        surroundingPassages: {
          previous: previousChunks,
          next: nextChunks,
          recent: recentChunks
        }
      })
    }]
  };
}

function recordFromChoice(message) {
  const rawArguments = toolArguments(message);
  if (typeof rawArguments === "string") return JSON.parse(rawArguments);
  if (rawArguments && typeof rawArguments === "object") return rawArguments;
  return recordFromContent(message.content);
}

function toolArguments(message) {
  const call = message.tool_calls?.[0] ?? message.toolCalls?.[0];
  return call?.function?.arguments ?? call?.arguments;
}

function recordFromContent(content) {
  if (typeof content !== "string" || !content.trim()) return {};
  return JSON.parse(content);
}

function shallowFilterPass(record) {
  const question = String(record.userFacingText ?? "").toLowerCase().trim();
  if (!record.expectedAnswer) return false;
  if (usesRankedMetadata(record.questionStrategyId) && !record.questionDepth) return false;
  if (record.questionDepth === "recall" && usesRankedMetadata(record.questionStrategyId)) return false;
  if (/^(what is|what are|what does the passage say|which thing)\b/.test(question)) return false;
  return !passage.toLowerCase().includes(question.replace(/[?!.]/g, ""));
}

function usesRankedMetadata(strategyId) {
  return strategyId === "candidate_ranked_v1" || strategyId === "sketch_then_rank_v1";
}

function qualityNote(record) {
  const depth = record.questionDepth;
  if (depth === "hidden_assumption" || depth === "implication" || depth === "transfer") return "inference";
  if (depth === "evidence_check") return "evidence";
  if (depth === "recall") return "recall";
  return record.reasoningNeeded ?? "too broad";
}

function cleanCell(value) {
  return String(value ?? "").replaceAll("|", "/").replaceAll(/\s+/g, " ").slice(0, 400);
}

function chunkPassage(text) {
  const body = text.replace(/^# .+$/m, "").trim();
  const parts = body.split(/\n\s*\n/).map((part) => part.replaceAll(/\s+/g, " ").trim()).filter(Boolean);
  return parts.map((part, index) => ({
    chunkId: `playbook-${index + 1}`,
    heading: "Escalation Playbook",
    order: index,
    preview: part.slice(0, 180),
    text: part
  }));
}
