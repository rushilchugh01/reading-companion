import type { DebugEvent } from "./debug-types";
import type { AnswerGradeInput, ChatSendInput, ChatSendResult, InterventionComposeInput, InterventionComposeResult } from "./intervention-types";
import type { ModelQueueDebugSnapshot } from "./model-job-types";
import type { CurrentRuntimeSnapshot } from "./runtime-types";
import type { CompanionSettings } from "./settings-types";
import type { CognitiveMove, InterventionPolicyId } from "./settings-types";
import type { WeakConcept } from "./session-types";

/** Runtime messages exchanged between content UI and background worker. */
export type RuntimeMessage =
  | { type: "settings:get" }
  | { type: "settings:set"; settings: CompanionSettings }
  | { type: "settings:open" }
  | { type: "runtime:snapshot"; payload: CurrentRuntimeSnapshot }
  | { type: "runtime:debugModelJobs" }
  | InterventionComposeRuntimeMessage
  | { type: "question:generate"; payload: QuestionPromptPayload }
  | { type: "answer:grade"; payload: AnswerGradeInput }
  | ChatSendRuntimeMessage
  | { type: "modelJob:cancelForPage"; payload: { pageId: string } }
  | { type: "weakConcept:save"; concept: WeakConcept }
  | { type: "debug:event"; event: DebugEvent };

export type InterventionComposeRuntimeMessage = { type: "intervention:compose"; payload: InterventionComposeInput };
export type ChatSendRuntimeMessage = { type: "chat:send"; payload: ChatSendInput };
export type InterventionComposeMessageResult = InterventionComposeResult;
export type ChatSendMessageResult = ChatSendResult;
export type RuntimeDebugModelJobsResult = ModelQueueDebugSnapshot;
export type LegacyQuestionPromptPayload = QuestionPromptPayload;

/** Payload used for read-gated question generation. */
export type QuestionPromptPayload = {
  chunkText: string;
  heading: string;
  personaId: string;
  readGatingMode: CompanionSettings["readGatingMode"];
  opportunity?: QuestionPromptOpportunity;
};

/** Compact policy opportunity sent to the model prompt. */
export type QuestionPromptOpportunity = {
  targetChunkId: string;
  reason: string;
  confidence: number;
  suggestedMoves: CognitiveMove[];
  policyId: InterventionPolicyId;
};
