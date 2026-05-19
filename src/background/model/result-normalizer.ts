import type {
  AnswerGradeResult,
  InterventionAction,
  InterventionComposeInput,
  InterventionComposeResult,
  ObservationType,
  PetIntent
} from "../../shared/intervention-types";
import type { GradeLabel } from "../../shared/session-types";
import type { PiModelResult } from "../pi-model-provider";

const INTERVENTION_ACTIONS = new Set<InterventionAction>([
  "ask_question",
  "offer_prediction",
  "offer_observation",
  "offer_help",
  "stay_quiet"
]);

const OBSERVATION_TYPES = new Set<ObservationType>([
  "key_point",
  "hidden_assumption",
  "contrast",
  "contradiction",
  "connection",
  "warning",
  "cool_fact",
  "example_mapping"
]);

const PET_INTENTS = new Set<PetIntent>([
  "quiet",
  "curious",
  "sharp_notice",
  "playful_strict",
  "concerned",
  "helpful",
  "pleased",
  "explaining"
]);

const GRADE_LABELS = new Set<GradeLabel>([
  "correct",
  "partially_correct",
  "wrong",
  "handwavy",
  "missed_key_point"
]);

/** Normalizes provider text or tool calls into an app-level intervention result. */
export function normalizeInterventionResult(
  result: PiModelResult,
  input: InterventionComposeInput
): InterventionComposeResult {
  const toolCall = result.toolCalls.find((call) => INTERVENTION_ACTIONS.has(call.name as InterventionAction));
  const record = toolCall
    ? { ...toolCall.arguments, action: toolCall.name }
    : recordFromText(result.text);
  return normalizeInterventionRecord(record, input);
}

/** Normalizes one provider record into an app-level intervention result. */
export function normalizeInterventionRecord(
  record: Record<string, unknown>,
  input: Pick<InterventionComposeInput, "requestId" | "expiresAt">
): InterventionComposeResult {
  const action = actionField(record);
  const normalized: InterventionComposeResult = {
    requestId: stringField(record, "requestId") || input.requestId,
    action,
    userFacingText: optionalStringField(record, "userFacingText"),
    expectedAnswer: optionalStringField(record, "expectedAnswer"),
    observationType: observationTypeField(record),
    followupOptions: stringArrayField(record, "followupOptions"),
    petIntent: petIntentField(record, action),
    reasonForApp: stringField(record, "reasonForApp") || stringField(record, "reason") || defaultReason(action),
    confidence: clampConfidence(numberField(record, "confidence")),
    expiresAt: numberField(record, "expiresAt") || input.expiresAt
  };
  validateInterventionResult(normalized);
  return withoutEmptyOptionals(normalized);
}

/** Enforces per-action intervention payload requirements. */
export function validateInterventionResult(result: InterventionComposeResult): void {
  if (result.action === "ask_question" || result.action === "offer_prediction") {
    requireField(result.userFacingText, `${result.action} requires userFacingText.`);
    requireField(result.expectedAnswer, `${result.action} requires expectedAnswer.`);
  }
  if (result.action === "offer_observation") {
    requireField(result.userFacingText, "offer_observation requires userFacingText.");
    if (!result.observationType) {
      throw new Error("offer_observation requires observationType.");
    }
  }
  if (result.action === "offer_help") {
    requireField(result.userFacingText, "offer_help requires userFacingText.");
  }
  if (result.action === "stay_quiet" && result.userFacingText) {
    throw new Error("stay_quiet must not include userFacingText.");
  }
}

/** Normalizes grade tool calls or JSON text into the public grade result. */
export function normalizeGradeResult(result: PiModelResult, requestId?: string): AnswerGradeResult {
  const gradeAnswer = result.toolCalls.find((toolCall) => toolCall.name === "grade_answer");
  const record = gradeAnswer?.arguments ?? recordFromText(result.text);
  const label = gradeLabelField(record);
  const feedback = stringField(record, "feedback");
  if (!label || !feedback) {
    throw new Error("Provider returned an incomplete grading payload.");
  }
  return {
    requestId,
    label,
    feedback,
    hint: optionalStringField(record, "hint"),
    missedPoint: optionalStringField(record, "missedPoint"),
    shouldRetry: booleanField(record, "shouldRetry")
  };
}

/** Parses provider text as a single JSON object. */
export function recordFromText(text: string): Record<string, unknown> {
  if (!text) return {};
  const parsed = JSON.parse(jsonTextFromProviderText(text)) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Model returned non-object JSON.");
  }
  return parsed as Record<string, unknown>;
}

/** Removes common Markdown JSON fences from provider text responses. */
function jsonTextFromProviderText(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

/** Reads a non-empty string field from a provider record. */
export function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Reads a non-empty string field as an optional value. */
export function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
  return stringField(record, key) || undefined;
}

/** Reads and validates the requested intervention action. */
function actionField(record: Record<string, unknown>): InterventionAction {
  const value = record.action;
  if (INTERVENTION_ACTIONS.has(value as InterventionAction)) return value as InterventionAction;
  throw new Error("Provider returned an unsupported intervention action.");
}

/** Reads a valid observation type when present. */
function observationTypeField(record: Record<string, unknown>): ObservationType | undefined {
  const value = record.observationType;
  return OBSERVATION_TYPES.has(value as ObservationType) ? (value as ObservationType) : undefined;
}

/** Reads a valid pet intent or chooses an action-appropriate default. */
function petIntentField(record: Record<string, unknown>, action: InterventionAction): PetIntent {
  const value = record.petIntent;
  if (PET_INTENTS.has(value as PetIntent)) return value as PetIntent;
  return action === "stay_quiet" ? "quiet" : "curious";
}

/** Reads a valid answer grade label when present. */
function gradeLabelField(record: Record<string, unknown>): GradeLabel | undefined {
  const value = record.label;
  return GRADE_LABELS.has(value as GradeLabel) ? (value as GradeLabel) : undefined;
}

/** Reads a finite numeric field with zero as the missing sentinel. */
function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Reads a boolean field when present. */
function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

/** Reads a trimmed string array when present. */
function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
}

/** Keeps provider confidence inside the public 0..1 range. */
function clampConfidence(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Supplies a readable app-facing reason when the provider omitted one. */
function defaultReason(action: InterventionAction): string {
  return action === "stay_quiet" ? "The model chose not to interrupt." : "The model selected this intervention.";
}

/** Throws the validation message when a required string is absent. */
function requireField(value: string | undefined, message: string): void {
  if (!value) throw new Error(message);
}

/** Drops undefined optionals without changing required fields. */
function withoutEmptyOptionals(result: InterventionComposeResult): InterventionComposeResult {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined)
  ) as InterventionComposeResult;
}
