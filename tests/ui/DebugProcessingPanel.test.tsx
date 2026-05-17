import { fireEvent, render, screen } from "@testing-library/react";
import { DebugProcessingPanel } from "@/ui/DebugProcessingPanel";
import type { DebugSnapshot } from "@/shared/debug-types";

const baseSnapshot: DebugSnapshot = {
  activeAvatarPack: "brutal-tutor-dog",
  chunks: [],
  contentType: "html",
  cooldownRemainingMilliseconds: 0,
  currentAnimation: "idle",
  currentState: "reading_detected",
  dismissalCount: 0,
  model: "",
  parserStatus: "ready",
  providerBaseUrl: "",
  providerName: "",
  policy: {
    interventionFrequency: "medium",
    overrides: {},
    personaId: "brutal-tutor-dog",
    policyId: "ambient_active_reading_v1",
    readGatingMode: "balanced",
    storageMode: "local_only",
    strictness: "medium"
  },
  recentEvents: [],
  title: "Debug page",
  url: "https://example.test/debug",
  visibleChunkIds: []
};

describe("DebugProcessingPanel", () => {
  it("shows rich runtime diagnostics when optional debug fields are present", () => {
    renderPanel(richSnapshot());

    expect(screen.getByLabelText("Runtime state lane")).toHaveTextContent("parserready");
    expect(screen.getByLabelText("Policy")).toHaveTextContent("allowed chunk_ready");
    expect(screen.getByLabelText("Model queue")).toHaveTextContent("queued");
    expect(screen.getByLabelText("Recent model calls")).toHaveTextContent("ask_question");
    expect(screen.getByLabelText("Recent model calls")).toHaveTextContent("input=");
    expect(screen.getByLabelText("Recent model calls")).toHaveTextContent("result=ask_question returned question");
    expect(screen.getByLabelText("Recent model calls")).toHaveTextContent("241ms");
    expect(screen.getByText("Policy machine")).toBeInTheDocument();
    expect(screen.getByText("Policy machine: 4 quiet -> eligible via viewport (chunk ready)")).toBeInTheDocument();
  });

  it("stays useful when runtime-only debug fields are absent", () => {
    renderPanel(baseSnapshot);

    expect(screen.getByLabelText("Provider and settings")).toHaveTextContent("missing");
    expect(screen.getByLabelText("Model queue")).toHaveTextContent("not reported");
    expect(screen.getByText("No model calls captured.")).toBeInTheDocument();
    expect(screen.getByText("No central logs captured.")).toBeInTheDocument();
    expect(screen.getByText("No chunks are currently visible.")).toBeInTheDocument();
  });

  it("lets dense sections collapse without losing the overview", () => {
    renderPanel(richSnapshot());

    const modelCalls = screen.getByLabelText("Recent model calls");
    expect(modelCalls).toHaveAttribute("open");

    fireEvent.click(screen.getByText("Recent model calls"));

    expect(modelCalls).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Runtime state lane")).toHaveTextContent("parserready");
  });
});

function renderPanel(debugSnapshot: DebugSnapshot) {
  render(
    <DebugProcessingPanel
      appProps={{ debugSnapshot }}
      onBack={vi.fn()}
      onOpenLegacyDebug={vi.fn()}
    />
  );
}

function richSnapshot(): DebugSnapshot {
  return {
    ...baseSnapshot,
    model: "test-model",
    providerBaseUrl: "https://models.example.test/v1",
    providerName: "test-provider",
    policy: {
      ...baseSnapshot.policy,
      lastDecision: {
        allowed: true,
        confidence: 0.82,
        opportunityReason: "chunk_ready",
        suggestedMoves: ["offer_prediction"],
        suppressedReasons: [],
        targetChunkId: "chunk-1"
      }
    },
    runtimeSpine: richRuntimeSpine()
  };
}

function richRuntimeSpine(): NonNullable<DebugSnapshot["runtimeSpine"]> {
  return {
    animationResolver: "runtime_wired",
    modelQueue: "background_router_enabled",
    modelQueueSnapshot: {
      activeJobIds: ["job-live"],
      pendingCount: 2,
      queuedJobIds: ["job-next"],
      runningCount: 1,
      status: "queued"
    },
    pageHistory: "store_available",
    recentLogLines: ["info runtime: selected chunk-1"],
    recentModelCalls: [{
      action: "ask_question",
      durationMilliseconds: 241,
      id: "call-1",
      input: "{\"chunkId\":\"chunk-1\"}",
      model: "test-model",
      result: "ask_question returned question",
      status: "pass",
      timestamp: 5
    }],
    resultValidator: "intervention_compose_enabled",
    runtimeMode: "runtime_controller",
    stateMachineSnapshots: [{
      activeState: "eligible",
      id: "policy-machine",
      label: "Policy machine",
      recentTransitions: [{ at: 4, event: "viewport", from: "quiet", reason: "chunk ready", to: "eligible" }]
    }],
    stateMachines: "runtime_wired"
  };
}
