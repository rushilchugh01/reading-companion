import type { Tool } from "@earendil-works/pi-ai";
import type { InterventionAction, ObservationType, PetIntent, QuestionDepth } from "../shared/intervention-types";
import type { QuestionGenerationStrategyId } from "../shared/settings-types";
import type { GradeLabel } from "../shared/session-types";

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

export type CompanionToolRoute = "intervention" | "grading" | "none";
type JsonSchema = Tool["parameters"];

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

const QUESTION_STRATEGIES: QuestionGenerationStrategyId[] = [
  "single_shot_v1",
  "candidate_ranked_v1",
  "sketch_then_rank_v1"
];

const QUESTION_DEPTHS: QuestionDepth[] = [
  "recall",
  "explain_why",
  "hidden_assumption",
  "evidence_check",
  "connection",
  "implication",
  "transfer",
  "self_explanation"
];

/** Intervention tools the model may request; deterministic app policy still approves final actions. */
export function interventionTools(): Tool[] {
  return [
    companionTool("ask_question", "Ask one read-gated active-reading question.", {
      userFacingText: stringSchema(),
      expectedAnswer: stringSchema(),
      questionStrategyId: enumSchema(QUESTION_STRATEGIES),
      questionDepth: enumSchema(QUESTION_DEPTHS),
      targetIdea: stringSchema(),
      reasoningNeeded: stringSchema(),
      followupOptions: stringArraySchema(),
      petIntent: enumSchema(PET_INTENTS),
      reasonForApp: stringSchema(),
      confidence: numberSchema()
    }, ["userFacingText", "expectedAnswer", "petIntent", "reasonForApp", "confidence"]),
    companionTool("offer_prediction", "Ask the reader to predict what comes next from seen context.", {
      userFacingText: stringSchema(),
      expectedAnswer: stringSchema(),
      questionStrategyId: enumSchema(QUESTION_STRATEGIES),
      questionDepth: enumSchema(QUESTION_DEPTHS),
      targetIdea: stringSchema(),
      reasoningNeeded: stringSchema(),
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
    }, ["petIntent", "reasonForApp", "confidence"])
  ];
}

/** Grading tools the model may request for answer evaluation. */
export function gradingTools(): Tool[] {
  return [
    companionTool("grade_answer", "Grade a user's answer with medium-strict active-reading labels.", {
      label: enumSchema(GRADE_LABELS),
      feedback: stringSchema(),
      hint: stringSchema(),
      missedPoint: stringSchema(),
      shouldRetry: booleanSchema()
    }, ["label", "feedback", "shouldRetry"])
  ];
}

/** Returns the exact tool catalogue for one model route. */
export function companionToolsForRoute(route: CompanionToolRoute): Tool[] | undefined {
  if (route === "intervention") return interventionTools();
  if (route === "grading") return gradingTools();
  return undefined;
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
