import type { DebugEvent } from "./debug-types";
import type { AnswerGradeInput, ChatSendInput, ChatSendResult, InterventionComposeInput, InterventionComposeResult } from "./intervention-types";
import type { ModelQueueDebugSnapshot } from "./model-job-types";
import type { CurrentRuntimeSnapshot } from "./runtime-types";
import type { CompanionSettings } from "./settings-types";
import type { WeakConcept } from "./session-types";

/** Runtime messages exchanged between content UI and background worker. */
export type RuntimeMessage =
  | { type: "settings:get" }
  | { type: "settings:set"; settings: CompanionSettings }
  | { type: "settings:open" }
  | { type: "runtime:snapshot"; payload: CurrentRuntimeSnapshot }
  | { type: "runtime:debugModelJobs" }
  | InterventionComposeRuntimeMessage
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
