import { Bug, ChevronDown, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { CompanionBubble, ToolPanelFrame, ToolPanelHeader } from "./tool-panels/primitives";
import type { CompanionPetAppProps, HomePanelActionResult } from "./types";
import type { DebugModelCallSnapshot, DebugStateMachineSnapshot, DebugTransitionSnapshot } from "../shared/debug-types";

type DebugProcessingPanelProps = {
  appProps: CompanionPetAppProps;
  onBack: () => void;
  onOpenLegacyDebug: () => void;
  onOpenSettings?: () => void;
  themeId?: CompanionPetAppProps["panelTheme"];
};

type DebugSnapshot = NonNullable<CompanionPetAppProps["debugSnapshot"]>;
type DebugFact = [string, string];
type DebugListItem = { badge?: string; text: string };

/** Builds the compact legacy debug summary shown by the debug button. */
export function debugActionResult(appProps: CompanionPetAppProps): HomePanelActionResult {
  const snapshot = appProps.debugSnapshot;
  if (!snapshot) return { headline: "Debug", body: "No debug snapshot has been captured yet." };
  return {
    headline: "Debug",
    body: [
      "Policy settings",
      `Policy: ${snapshot.policy.policyId}`,
      `Last policy decision: ${snapshot.policy.lastDecision?.reason ?? snapshot.policy.lastDecision?.opportunityReason ?? "none"}`,
      `Provider: ${snapshot.providerName || "unknown"} / ${snapshot.model || "unknown"}`,
      `Provider URL: ${snapshot.providerBaseUrl || "default"}`,
      `Recent events: ${snapshot.recentEvents.map((event) => event.code).join(", ") || "none"}`
    ].join("\n")
  };
}

/** Renders the fuller debug-mode processing panel. */
export function DebugProcessingPanel({
  appProps,
  onBack,
  onOpenLegacyDebug,
  onOpenSettings,
  themeId
}: DebugProcessingPanelProps) {
  const snapshot = appProps.debugSnapshot;
  return (
    <ToolPanelFrame className="rc-tool-panel--processing-debug" themeId={themeId}>
      <ToolPanelHeader
        avatarState="thinking"
        title="Processing"
        subtitle={snapshot?.title || "Debug diagnostics"}
        menu={<DebugPanelMenu onBack={onBack} onOpenLegacyDebug={onOpenLegacyDebug} onOpenSettings={onOpenSettings} />}
      />
      {snapshot ? <DebugProcessingSnapshot snapshot={snapshot} /> : (
        <CompanionBubble className="rc-debug-empty" tone="soft" role="status">
          <p>No debug snapshot has been captured yet.</p>
        </CompanionBubble>
      )}
    </ToolPanelFrame>
  );
}

function DebugPanelMenu(props: Pick<DebugProcessingPanelProps, "onBack" | "onOpenLegacyDebug" | "onOpenSettings">) {
  return (
    <div className="rc-tool-header-actions">
      {props.onOpenSettings ? (
        <button className="rc-tool-icon-button" type="button" aria-label="Open companion settings" title="Open companion settings" onClick={props.onOpenSettings}>
          <Settings size={22} />
        </button>
      ) : null}
      <button className="rc-tool-icon-button" type="button" aria-label="Open debug panel" title="Open debug panel" onClick={props.onOpenLegacyDebug}>
        <Bug size={22} />
      </button>
      <button className="rc-tool-icon-button" type="button" aria-label="Back to reading tools" title="Back to reading tools" onClick={props.onBack}>
        <ChevronDown size={22} />
      </button>
    </div>
  );
}

function DebugProcessingSnapshot({ snapshot }: { snapshot: DebugSnapshot }) {
  const visibleChunks = snapshot.chunks.filter((chunk) => snapshot.visibleChunkIds.includes(chunk.id));
  return (
    <div className="rc-debug rc-debug--dashboard" aria-label="Processing debug details">
      <DebugStateLane snapshot={snapshot} />
      <DebugFacts className="rc-debug__section--wide" title="Runtime spine" status={runtimeStatus(snapshot)} facts={runtimeSpineFacts(snapshot)} />
      <DebugFacts className="rc-debug__section--compact" title="Parser" status={snapshot.parserStatus} facts={parserFacts(snapshot, visibleChunks)} />
      <DebugFacts className="rc-debug__section--wide" title="Policy" status={policyStatus(snapshot)} facts={policyFacts(snapshot)} />
      <DebugStateMachines snapshot={snapshot} />
      <DebugFacts className="rc-debug__section--compact" title="Provider and settings" status={providerStatus(snapshot)} facts={providerFacts(snapshot)} />
      <DebugFacts className="rc-debug__section--compact" title="Page" status={snapshot.contentType} facts={pageFacts(snapshot)} />
      <DebugFacts className="rc-debug__section--wide" title="Model queue" status={modelQueueStatus(snapshot)} facts={modelQueueFacts(snapshot)} />
      <DebugList className="rc-debug__section--full rc-debug__section--timeline" title="Recent model calls" items={modelCallItems(snapshot)} empty="No model calls captured." />
      <DebugFacts className="rc-debug__section--wide" title="Intervention surfaces" status={interventionSurfaceStatus(snapshot)} facts={interventionSurfaceFacts(snapshot)} />
      <DebugList className="rc-debug__section--full" title="Recent transitions" items={transitionItems(snapshot)} empty="No transitions captured." />
      <DebugList className="rc-debug__section--split" title="Recent events" items={eventItems(snapshot)} empty="No recent events." />
      <DebugList className="rc-debug__section--split" title="Recent logs" items={logItems(snapshot)} empty="No central logs captured." />
      <DebugList className="rc-debug__section--full rc-debug__section--timeline" title="Visible chunks" items={visibleChunks.map(formatVisibleChunk)} empty="No chunks are currently visible." />
    </div>
  );
}

function DebugStateLane({ snapshot }: { snapshot: DebugSnapshot }) {
  return (
    <section className="rc-debug__lane" aria-label="Runtime state lane">
      {stateLaneItems(snapshot).map(([label, value]) => (
        <div className="rc-debug__lane-node" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function DebugStateMachines({ snapshot }: { snapshot: DebugSnapshot }) {
  const machines = stateMachines(snapshot);
  return (
    <CollapsibleDebugSection title="State machines" status={machines.length > 0 ? `${machines.length} active` : snapshot.runtimeSpine?.stateMachines ?? "not reported"}>
      <div className="rc-debug__machines">
        {(machines.length > 0 ? machines : fallbackStateMachines(snapshot)).map((machine) => (
          <article className="rc-debug__machine" key={machine.id}>
            <div>
              <span>{machine.label ?? machine.id}</span>
              <strong>{machine.activeState}</strong>
            </div>
            <ol>
              {(machine.recentTransitions?.length ? machine.recentTransitions.map(formatTransition) : ["No recent transitions."]).slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </CollapsibleDebugSection>
  );
}

function DebugFacts({
  className,
  facts,
  status,
  title
}: {
  className?: string;
  facts: DebugFact[];
  status?: string;
  title: string;
}) {
  return (
    <CollapsibleDebugSection className={className} title={title} status={status}>
      <dl className="rc-debug__facts">
        {facts.map(([label, value]) => <FragmentPair key={label} label={label} value={value} />)}
      </dl>
    </CollapsibleDebugSection>
  );
}

function CollapsibleDebugSection({
  children,
  className,
  status,
  title
}: {
  children: ReactNode;
  className?: string;
  status?: string;
  title: string;
}) {
  return (
    <details className={sectionClassName(className)} aria-label={title} open>
      <summary>
        <SectionHeading title={title} status={status} />
      </summary>
      {children}
    </details>
  );
}

function SectionHeading({ status, title }: { status?: string; title: string }) {
  return (
    <h3>
      <span>{title}</span>
      {status ? <em className="rc-debug__badge">{status}</em> : null}
    </h3>
  );
}

function FragmentPair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
    </>
  );
}

function DebugList({
  className,
  empty,
  items,
  title
}: {
  className?: string;
  empty: string;
  items: DebugListItem[];
  title: string;
}) {
  const visibleItems = items.length > 0 ? items : [{ text: empty }];
  return (
    <CollapsibleDebugSection className={className} title={title} status={items.length > 0 ? String(items.length) : undefined}>
      <ol className="rc-debug__list">
        {visibleItems.slice(0, 8).map((item) => (
          <li key={`${item.badge ?? "item"}-${item.text}`}>
            {item.badge ? <span className={`rc-debug__pill rc-debug__pill--${item.badge}`}>{item.badge}</span> : null}
            <span>{item.text}</span>
          </li>
        ))}
      </ol>
    </CollapsibleDebugSection>
  );
}

function sectionClassName(className?: string): string {
  return ["rc-debug__section", className].filter(Boolean).join(" ");
}

function runtimeSpineFacts(snapshot: DebugSnapshot): DebugFact[] {
  const value = runtimeSpineValue(snapshot);
  return [
    ["Runtime", value("runtimeMode")],
    ["State machines", value("stateMachines")],
    ["Animation resolver", value("animationResolver")],
    ["Result validator", value("resultValidator")],
    ["Page history", value("pageHistory")],
    ["Model queue", value("modelQueue")],
    ["Central logs", value("recentLogLines")]
  ];
}

function runtimeSpineValue(snapshot: DebugSnapshot): (key: keyof NonNullable<DebugSnapshot["runtimeSpine"]>) => string {
  const spine = snapshot.runtimeSpine;
  return (key) => {
    const value = spine?.[key];
    if (Array.isArray(value)) return String(value.length);
    return typeof value === "string" ? value : "not reported";
  };
}

function parserFacts(snapshot: DebugSnapshot, visibleChunks: DebugSnapshot["chunks"]): DebugFact[] {
  return [
    ["Status", snapshot.parserStatus || "unknown"],
    ["Message", snapshot.parserMessage || "none"],
    ["Content type", snapshot.contentType || "unknown"],
    ["Chunks", String(snapshot.chunks.length)],
    ["Visible chunks", `${snapshot.visibleChunkIds.length}${formatVisibleChunkSummary(visibleChunks)}`],
    ["Chunk states", countChunkStates(snapshot.chunks) || "none"]
  ];
}

function policyFacts(snapshot: DebugSnapshot): DebugFact[] {
  const decision = snapshot.policy.lastDecision;
  return [
    ["Policy", snapshot.policy.policyId],
    ["Active decision", decision ? `${decision.allowed ? "allowed" : "suppressed"} ${decision.reason ?? decision.opportunityReason ?? "unspecified"}` : "idle"],
    ["Target chunk", decision?.targetChunkId ?? "none"],
    ["Confidence", formatOptionalNumber(decision?.confidence)],
    ["Suggested moves", decision?.suggestedMoves.join(", ") || "none"],
    ["Suppressed", decision?.suppressedReasons.join(", ") || "none"],
    ["Frequency", snapshot.policy.interventionFrequency],
    ["Read gating", snapshot.policy.readGatingMode],
    ["Persona", snapshot.policy.personaId],
    ["Strictness", snapshot.policy.strictness],
    ["Storage", snapshot.policy.storageMode],
    ["Overrides", formatPolicyOverrides(snapshot.policy.overrides)]
  ];
}

function providerFacts(snapshot: DebugSnapshot): DebugFact[] {
  return [
    ["Provider", snapshot.providerName || "unknown"],
    ["URL", snapshot.providerBaseUrl || "default"],
    ["Model", snapshot.model || "unknown"],
    ["Avatar pack", snapshot.activeAvatarPack || "unknown"],
    ["Pet state", snapshot.currentState || "unknown"],
    ["Animation", snapshot.currentAnimation || "unknown"],
    ["Cooldown", formatMilliseconds(snapshot.cooldownRemainingMilliseconds)],
    ["Dismissals", String(snapshot.dismissalCount)]
  ];
}

function pageFacts(snapshot: DebugSnapshot): DebugFact[] {
  return [
    ["Title", snapshot.title || "untitled"],
    ["URL", snapshot.url || "unknown"],
    ["Last prompt", snapshot.lastPrompt || "none"]
  ];
}

function modelQueueFacts(snapshot: DebugSnapshot): DebugFact[] {
  const queue = snapshot.runtimeSpine?.modelQueueSnapshot ?? {};
  const wiring = snapshot.runtimeSpine?.modelQueue ?? "not reported";
  return [
    ["Wiring", wiring],
    ["Status", queue.status ?? "not reported"],
    ["Total", formatOptionalNumber(queue.totalCount)],
    ["Pending", formatOptionalNumber(queue.pendingCount)],
    ["Running", formatOptionalNumber(queue.runningCount)],
    ["Completed", formatOptionalNumber(queue.completedCount)],
    ["Failed", formatOptionalNumber(queue.failedCount)],
    ["Queued jobs", queue.queuedJobIds?.join(", ") || "none"],
    ["Active jobs", queue.activeJobIds?.join(", ") || "none"],
    ["Updated", formatTime(queue.lastUpdatedAt)]
  ];
}

function interventionSurfaceFacts(snapshot: DebugSnapshot): DebugFact[] {
  const calls = snapshot.runtimeSpine?.recentModelCalls ?? [];
  const actionCounts = countModelActions(calls);
  return [
    ["Allowed actions", "ask_question, offer_prediction, offer_observation, offer_help, stay_quiet"],
    ["Last action", calls[0]?.action ?? "none"],
    ["Questions", String(actionCounts.ask_question ?? 0)],
    ["Predictions", String(actionCounts.offer_prediction ?? 0)],
    ["Observations", String(actionCounts.offer_observation ?? 0)],
    ["Help offers", String(actionCounts.offer_help ?? 0)],
    ["Stayed quiet", String(actionCounts.stay_quiet ?? 0)],
    ["Last validation", calls[0]?.validation ?? "none"]
  ];
}

function stateLaneItems(snapshot: DebugSnapshot): DebugFact[] {
  return [
    ["parser", snapshot.parserStatus || "unknown"],
    ["policy", policyStatus(snapshot)],
    ["pet", snapshot.currentState || "unknown"],
    ["queue", modelQueueStatus(snapshot)],
    ["validator", snapshot.runtimeSpine?.resultValidator ?? "not reported"]
  ];
}

function stateMachines(snapshot: DebugSnapshot): DebugStateMachineSnapshot[] {
  return snapshot.runtimeSpine?.stateMachineSnapshots ?? [];
}

function fallbackStateMachines(snapshot: DebugSnapshot): DebugStateMachineSnapshot[] {
  return [
    { activeState: snapshot.currentState || "unknown", id: "pet", label: "Pet state" },
    { activeState: snapshot.runtimeSpine?.stateMachines ?? "not reported", id: "runtime", label: "Runtime spine" }
  ];
}

function transitionItems(snapshot: DebugSnapshot): DebugListItem[] {
  const machineTransitions = stateMachines(snapshot).flatMap((machine) => (machine.recentTransitions ?? []).map((transition) => ({
    badge: "state",
    text: `${machine.label ?? machine.id}: ${formatTransition(transition)}`
  })));
  const decision = snapshot.policy.lastDecision;
  const policyTransition = decision ? [{
    badge: decision.allowed ? "pass" : "fail",
    text: `policy -> ${decision.allowed ? "allowed" : "suppressed"} (${decision.reason ?? decision.opportunityReason ?? "unspecified"})`
  }] : [];
  return [...policyTransition, ...machineTransitions];
}

function modelCallItems(snapshot: DebugSnapshot): DebugListItem[] {
  const directCalls = snapshot.runtimeSpine?.recentModelCalls ?? [];
  if (directCalls.length > 0) return directCalls.map(formatModelCall);
  return snapshot.recentEvents.filter(isModelEvent).map((event) => ({
    badge: event.code === "MODEL_REQUEST_FAILED" ? "fail" : event.code === "INTERVENTION_MODEL_STAYED_QUIET" ? "pending" : "pass",
    text: `${formatTime(event.timestamp)} ${event.code}: ${event.message}${formatMetadata(event.metadata)}`
  }));
}

function eventItems(snapshot: DebugSnapshot): DebugListItem[] {
  return snapshot.recentEvents.map((event) => ({
    badge: event.code.includes("FAILED") || event.code.includes("SUPPRESSED") ? "fail" : "event",
    text: `${formatTime(event.timestamp)} ${event.code}: ${event.message}${formatMetadata(event.metadata)}`
  }));
}

function logItems(snapshot: DebugSnapshot): DebugListItem[] {
  return (snapshot.runtimeSpine?.recentLogLines ?? []).map((text) => ({ badge: "log", text }));
}

function formatModelCall(call: DebugModelCallSnapshot): DebugListItem {
  const details = [
    call.kind,
    call.jobStatus,
    call.action,
    call.validation ? `validation=${call.validation}` : undefined,
    call.input ? `input=${call.input}` : undefined,
    call.result ? `result=${call.result}` : undefined,
    call.error ? `error=${call.error}` : undefined,
    call.durationMilliseconds === undefined ? undefined : formatMilliseconds(call.durationMilliseconds)
  ]
    .filter((value): value is string => Boolean(value));
  return {
    badge: call.status,
    text: `${formatTime(call.timestamp)} ${call.model ?? "model"}${details.length > 0 ? `: ${details.join(" | ")}` : ""}`
  };
}

function formatTransition(transition: DebugTransitionSnapshot): string {
  const source = transition.from ? `${transition.from} -> ` : "";
  const event = transition.event ? ` via ${transition.event}` : "";
  const reason = transition.reason ? ` (${transition.reason})` : "";
  return `${formatTime(transition.at)} ${source}${transition.to}${event}${reason}`;
}

function formatVisibleChunk(chunk: DebugSnapshot["chunks"][number]): DebugListItem {
  const text = [
    `[last seen ${formatTime(chunk.metrics.lastSeenAt)}, visible ${formatMilliseconds(chunk.metrics.visibleMilliseconds)}]`,
    chunk.id,
    `[${chunk.state}]`,
    `read:${formatScore(chunk.scores.readingConfidence)}`,
    `meaning:${formatScore(chunk.scores.meaningfulness)}`,
    `ready:${formatScore(chunk.scores.interventionReadiness)}`,
    chunk.heading || chunk.preview || chunk.kind
  ].join(" ");
  return { badge: chunk.state, text };
}

function countChunkStates(chunks: DebugSnapshot["chunks"]): string {
  const counts = chunks.reduce<Record<string, number>>((result, chunk) => {
    result[chunk.state] = (result[chunk.state] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).map(([state, count]) => `${state}:${count}`).join(", ");
}

function isModelEvent(event: DebugSnapshot["recentEvents"][number]): boolean {
  return ["MODEL_REQUEST_FAILED", "QUESTION_GENERATED", "ANSWER_GRADED", "INTERVENTION_MODEL_STAYED_QUIET"].includes(event.code);
}

function policyStatus(snapshot: DebugSnapshot): string {
  const decision = snapshot.policy.lastDecision;
  if (!decision) return "idle";
  return decision.allowed ? "allowed" : `suppressed:${decision.reason ?? "guardrail"}`;
}

function providerStatus(snapshot: DebugSnapshot): string {
  if (!snapshot.providerName && !snapshot.model) return "missing";
  return snapshot.providerBaseUrl ? "configured" : "default";
}

function modelQueueStatus(snapshot: DebugSnapshot): string {
  return snapshot.runtimeSpine?.modelQueueSnapshot?.status ?? snapshot.runtimeSpine?.modelQueue ?? "not reported";
}

function runtimeStatus(snapshot: DebugSnapshot): string {
  return snapshot.runtimeSpine?.runtimeMode ?? "not reported";
}

function interventionSurfaceStatus(snapshot: DebugSnapshot): string {
  return snapshot.runtimeSpine?.recentModelCalls?.[0]?.action ?? "idle";
}

function countModelActions(calls: DebugModelCallSnapshot[]): Record<string, number> {
  return calls.reduce<Record<string, number>>((result, call) => {
    const action = call.action ?? "unknown";
    result[action] = (result[action] ?? 0) + 1;
    return result;
  }, {});
}

function formatVisibleChunkSummary(chunks: DebugSnapshot["chunks"]): string {
  if (chunks.length === 0) return "";
  return ` (${chunks.slice(0, 3).map((chunk) => chunk.id).join(", ")})`;
}

function formatPolicyOverrides(overrides: DebugSnapshot["policy"]["overrides"]): string {
  const entries = Object.entries(overrides).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return entries.map(([key, value]) => `${key}:${value}`).join(", ") || "none";
}

function formatOptionalNumber(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "none";
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function formatMilliseconds(milliseconds: number | undefined): string {
  if (!milliseconds || milliseconds <= 0) return "none";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${Math.ceil(milliseconds / 1000)}s`;
}

function formatMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata || Object.keys(metadata).length === 0) return "";
  return ` ${JSON.stringify(metadata)}`;
}

function formatTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return "never";
  if (timestamp < 10_000) return String(timestamp);
  return new Date(timestamp).toLocaleTimeString();
}
