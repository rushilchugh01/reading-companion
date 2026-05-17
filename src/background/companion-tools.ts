import type { Tool } from "@earendil-works/pi-ai";
import type { InterventionAction, ObservationType, PetIntent } from "../shared/intervention-types";
import type { GradeLabel, QuestionStyle } from "../shared/session-types";

/** Names of companion actions the model may request through PI tools. */
export type CompanionToolName =
  | InterventionAction
  | "offer_prediction"
  | "offer_observation"
  | "offer_help"
  | "save_weak_concept"
  | "get_attention"
  | "offer_hint"
  | "grade_answer"
  | "set_pet_state";

/** Normalized PI tool call after provider-specific content blocks are flattened. */
export type CompanionToolCall = {
  name: CompanionToolName;
  arguments: Record<string, unknown>;
};

type JsonSchema = Tool["parameters"];

const QUESTION_STYLES: QuestionStyle[] = [
  "recall",
  "why_how",
  "prediction",
  "analogy",
  "code_walkthrough",
  "counterexample",
  "compare_contrast",
  "hidden_assumption"
];

const GRADE_LABELS: GradeLabel[] = [
  "correct",
  "partially_correct",
  "wrong",
  "handwavy",
  "missed_key_point"
];

const OBSERVATION_TYPES: ObservationType[] = [
  "key_point",
  "hidden_assumption",
  "contrast",
  "contradiction",
  "connection",
  "warning",
  "cool_fact",
  "example_mapping"
];

const PET_INTENTS: PetIntent[] = [
  "quiet",
  "curious",
  "sharp_notice",
  "playful_strict",
  "concerned",
  "helpful",
  "pleased",
  "explaining"
];

/** Tools the model may request; deterministic app policy still approves final actions. */
export function companionTools(): Tool[] {
  return [
    companionTool("ask_question", "Ask one read-gated active-reading question.", {
      userFacingText: stringSchema(),
      expectedAnswer: stringSchema(),
      followupOptions: stringArraySchema(),
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["userFacingText", "expectedAnswer", "petIntent", "reasonForApp", "confidence"]),
    companionTool("offer_prediction", "Ask the reader to predict what comes next from seen context.", {
      userFacingText: stringSchema(),
      expectedAnswer: stringSchema(),
      followupOptions: stringArraySchema(),
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["userFacingText", "expectedAnswer", "petIntent", "reasonForApp", "confidence"]),
    companionTool("offer_observation", "Offer one concise observation about the current passage.", {
      userFacingText: stringSchema(),
      observationType: enumSchema(OBSERVATION_TYPES),
      followupOptions: stringArraySchema(),
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["userFacingText", "observationType", "petIntent", "reasonForApp", "confidence"]),
    companionTool("offer_help", "Offer useful help without asking the reader to answer.", {
      userFacingText: stringSchema(),
      followupOptions: stringArraySchema(),
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["userFacingText", "petIntent", "reasonForApp", "confidence"]),
    companionTool("stay_quiet", "Decline to intervene when silence is the best cognitive move.", {
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["petIntent", "reasonForApp", "confidence"]),
    companionTool("grade_answer", "Grade a user's answer with medium-strict active-reading labels.", {
      label: enumSchema(GRADE_LABELS),
      feedback: stringSchema(),
      hint: stringSchema(),
      missedPoint: stringSchema(),
      shouldRetry: booleanSchema()
    }, ["label", "feedback", "shouldRetry"])
  ];
}

/** Legacy tool schemas kept for compatibility tests and older provider transcripts. */
export function legacyQuestionTools(): Tool[] {
  return [
    companionTool("ask_question", "Ask one read-gated active-reading question.", {
      question: stringSchema(),
      expectedPoint: stringSchema(),
      style: enumSchema(QUESTION_STYLES),
      targetChunkId: stringSchema(),
      urgency: enumSchema(["low", "medium", "high"])
    }, ["question", "expectedPoint", "style", "targetChunkId"]),
    companionTool("get_attention", "Suggest a light pet attention gesture before an allowed question.", {
      reason: stringSchema(),
      animation: enumSchema(["curious_tilt", "prompt_nudge", "thinking_grade"]),
      copy: stringSchema(),
      intensity: enumSchema([0, 1, 2])
    }, ["reason", "animation", "copy", "intensity"]),
    companionTool("offer_prediction", "Ask the reader to predict what comes next from seen context.", {
      prompt: stringSchema(),
      expectedDirection: stringSchema(),
      targetChunkId: stringSchema()
    }, ["prompt", "expectedDirection", "targetChunkId"]),
    companionTool("save_weak_concept", "Request saving a weak concept after a weak answer.", {
      concept: stringSchema(),
      missedPoint: stringSchema(),
      sourceChunkId: stringSchema()
    }, ["concept", "missedPoint", "sourceChunkId"]),
    companionTool("offer_hint", "Give one hint and request a retry.", {
      hint: stringSchema(),
      retryPrompt: stringSchema()
    }, ["hint", "retryPrompt"]),
    companionTool("grade_answer", "Grade a user's answer with medium-strict active-reading labels.", {
      label: enumSchema(GRADE_LABELS),
      feedback: stringSchema(),
      missedPoint: stringSchema(),
      shouldRetry: booleanSchema()
    }, ["label", "feedback", "shouldRetry"]),
    companionTool("stay_quiet", "Decline to intervene when silence is the best cognitive move.", {
      reason: stringSchema(),
      nextBestMoment: stringSchema()
    }, ["reason"]),
    companionTool("set_pet_state", "Suggest an expressive pet state for the current model action.", {
      state: enumSchema(["curious", "thinking", "listening", "confused", "celebratory"])
    }, ["state"])
  ];
}

/** Convert PI tool-call content into app-level companion calls. */
export function normalizeToolCalls(
  content: Array<{ type: string; name?: string; arguments?: Record<string, unknown> }>
): CompanionToolCall[] {
  return content.flatMap((block) => {
    if (block.type !== "toolCall" || !isCompanionToolName(block.name)) return [];
    return [{ name: block.name, arguments: block.arguments ?? {} }];
  });
}

/** Builds one PI tool declaration. */
function companionTool(
  name: CompanionToolName,
  description: string,
  properties: Record<string, unknown>,
  required: string[]
): Tool {
  return {
    name,
    description,
    parameters: objectSchema(properties, required)
  };
}

/** Builds an object JSON schema for PI tool parameters. */
function objectSchema(properties: Record<string, unknown>, required: string[]): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

/** Builds a string JSON schema. */
function stringSchema(): Record<string, unknown> {
  return { type: "string" };
}

/** Builds a boolean JSON schema. */
function booleanSchema(): Record<string, unknown> {
  return { type: "boolean" };
}

/** Builds a number JSON schema. */
function numberSchema(): Record<string, unknown> {
  return { type: "number" };
}

/** Builds a string-array JSON schema. */
function stringArraySchema(): Record<string, unknown> {
  return { type: "array", items: stringSchema() };
}

/** Builds an enum JSON schema. */
function enumSchema(values: Array<string | number>): Record<string, unknown> {
  return { enum: values };
}

/** Checks whether a PI tool call name belongs to the companion surface. */
function isCompanionToolName(name: string | undefined): name is CompanionToolName {
  return typeof name === "string" && [
    "ask_question",
    "get_attention",
    "offer_prediction",
    "offer_observation",
    "offer_help",
    "save_weak_concept",
    "offer_hint",
    "grade_answer",
    "stay_quiet",
    "set_pet_state"
  ].includes(name);
}
