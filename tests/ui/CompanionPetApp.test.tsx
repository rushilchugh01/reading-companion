import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { COMPANION_CHAT_THEMES, CompanionPetApp } from "@/ui";
import type { DebugSnapshot } from "@/shared/debug-types";
import type { QuestionSession } from "@/shared/session-types";
import type { CompanionPackManifest } from "@/shared/companion-pack-schema";
import type { CompanionPackRegistry } from "@/shared/companion-pack-registry";
import type { CompanionConversationMessage } from "@/ui/types";

const debugSnapshot: DebugSnapshot = {
  activeAvatarPack: "fallback-dog",
  chunks: [
    {
      id: "chunk-1",
      hash: "hash-1",
      heading: "Intro",
      text: "The first paragraph explains the premise.",
      preview: "The first paragraph explains the premise.",
      kind: "paragraph",
      order: 1,
      selector: "p:nth-of-type(1)",
      state: "probably_read",
      scores: {
        interventionReadiness: 0.7,
        meaningfulness: 0.8,
        readingConfidence: 0.6
      },
      metrics: {
        lastSeenAt: 1,
        revisitCount: 1,
        scrollVelocity: 0,
        selectionCount: 0,
        visibleMilliseconds: 1200,
        visibleRatio: 0.9
      }
    },
    {
      id: "chunk-2",
      hash: "hash-2",
      heading: "Evidence",
      text: "The second paragraph adds evidence.",
      preview: "The second paragraph adds evidence.",
      kind: "paragraph",
      order: 2,
      selector: "p:nth-of-type(2)",
      state: "seen",
      scores: {
        interventionReadiness: 0.2,
        meaningfulness: 0.4,
        readingConfidence: 0.3
      },
      metrics: {
        revisitCount: 0,
        scrollVelocity: 0,
        selectionCount: 0,
        visibleMilliseconds: 0,
        visibleRatio: 0
      }
    }
  ],
  contentType: "html",
  cooldownRemainingMilliseconds: 2500,
  currentAnimation: "idle",
  currentState: "debug_active",
  dismissalCount: 2,
  model: "test-model",
  parserMessage: "Processed two paragraphs",
  parserStatus: "ready",
  providerBaseUrl: "https://models.example.test/v1",
  policy: {
    interventionFrequency: "medium",
    lastDecision: {
      allowed: false,
      reason: "page_load",
      suggestedMoves: [],
      suppressedReasons: ["page_load"]
    },
    overrides: {
      minimumMeaningfulness: 0.5,
      minimumReadingConfidence: 0.4,
      pageLoadQuietMilliseconds: 8000
    },
    personaId: "brutal-tutor-dog",
    policyId: "ambient_active_reading_v1",
    readGatingMode: "balanced",
    storageMode: "local_only",
    strictness: "medium"
  },
  providerName: "test-provider",
  recentEvents: [{ id: "event-1", code: "PAGE_PARSED", message: "Parsed page", timestamp: 1, metadata: { chunks: 2 } }],
  runtimeSpine: {
    animationResolver: "module_ready",
    modelQueue: "background_router_enabled",
    pageHistory: "store_available",
    recentLogLines: ["info runtime: bootstrapped page"],
    resultValidator: "intervention_compose_enabled",
    runtimeMode: "content_shell_with_spine_modules",
    stateMachines: "module_ready"
  },
  title: "Test page",
  url: "https://example.test",
  visibleChunkIds: ["chunk-1"]
};

const questionSession: QuestionSession = {
  id: "question-1",
  attemptCount: 0,
  chunkId: "chunk-1",
  createdAt: 1,
  expectedAnswer: "The premise changed.",
  question: "What caused this to happen?",
  style: "why_how"
};

function assistantConversationMessage(id: string, text: string): CompanionConversationMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: "stop",
    status: "sent",
    timestamp: 1
  };
}

describe("CompanionPetApp", () => {
  it("keeps the companion pet visible", () => {
    render(<CompanionPetApp petState="curious" />);

    expect(screen.getByRole("button", { name: "Open reading companion" })).toBeInTheDocument();
    expect(document.querySelector(".rc-pet--scan")).toBeInTheDocument();
    expect(document.querySelector(".rc-pet__sprite")).toHaveAttribute(
      "src",
      "/assets/corgi-states-transparent/curious.png"
    );
  });

  it("opens the themed home panel by default", () => {
    render(<CompanionPetApp chatTheme="prediction-lilac" greeting="Hello reader" />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(screen.getByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
    expect(screen.getByText("What would help right now?")).toBeInTheDocument();
    expect(screen.getByText("Hello reader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summarize this bit" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ask something !!")).toHaveAttribute("placeholder", "Ask something !!");
    expect(COMPANION_CHAT_THEMES).toContain("peach-check");

    fireEvent.click(screen.getByRole("button", { name: "Close reading companion" }));
    expect(screen.queryByRole("region", { name: "Companion tool panel" })).not.toBeInTheDocument();
  });

  it("closes the open panel when the reader clicks outside it", () => {
    render(<CompanionPetApp greeting="Hello reader" />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(screen.getByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("region", { name: "Companion tool panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open reading companion" })).toBeInTheDocument();
  });

  it("keeps the open panel visible for clicks inside the companion", () => {
    render(<CompanionPetApp greeting="Hello reader" />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Summarize this bit" }));

    expect(screen.getByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
  });
});

describe("CompanionPetApp companion packs", () => {
  it("loads the selected registry pack asset when the app is mounted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(selectedPackManifest())
    } as Response);

    render(
      <CompanionPetApp
        companionPackId="visual-fox"
        companionPackRegistry={selectedPackRegistry()}
        petState="curious"
      />
    );

    expect(document.querySelector(".rc-pet__sprite")).toHaveAttribute(
      "src",
      "/assets/corgi-states-transparent/curious.png"
    );
    await waitFor(() => expect(document.querySelector(".rc-pet__sprite")).toHaveAttribute(
      "src",
      "https://packs.example/visual-fox/scan.webp"
    ));
    expect(fetchMock).toHaveBeenCalledWith("https://packs.example/visual-fox/companion-pack.json");
    fetchMock.mockRestore();
  });
});

describe("CompanionPetApp home panel actions", () => {
  it("shows the settings button on the home panel without the legacy debug panel", () => {
    const onOpenSettings = vi.fn();
    render(<CompanionPetApp greeting="Hello reader" onOpenSettings={onOpenSettings} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));

    fireEvent.click(screen.getByRole("button", { name: "Open companion settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Open debug panel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reading companion panel" })).not.toBeInTheDocument();
  });

  it("opens the home panel menu and runs menu actions", () => {
    const onHideSite = vi.fn();
    render(<CompanionPetApp greeting="Hello reader" onHideSite={onHideSite} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.click(screen.getByRole("button", { name: "Open companion tools" }));

    expect(screen.getByRole("menuitem", { name: "Hide on this site" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide on this site" }));
    expect(onHideSite).toHaveBeenCalledTimes(1);
  });
});

function selectedPackRegistry(): CompanionPackRegistry {
  return {
    activePackId: "visual-fox",
    entries: [{
      id: "visual-fox",
      name: "Visual Fox",
      version: "1.0.0",
      source: "remote",
      manifestPath: "https://packs.example/visual-fox/companion-pack.json",
      enabled: true
    }]
  };
}

function selectedPackManifest(): CompanionPackManifest {
  return {
    id: "visual-fox",
    name: "Visual Fox",
    avatar: {
      id: "visual-fox",
      name: "Visual Fox",
      version: "1.0.0",
      species: "fox",
      animationSlots: {
        idle: [{ id: "fox-idle", src: "idle.webp", type: "animated-webp", role: "primary" }],
        scan: [{ id: "fox-scan", src: "scan.webp", type: "animated-webp", role: "primary" }]
      },
      thresholds: {
        maxIntensity: 2,
        proactiveMotionMinimumMilliseconds: 900,
        backoffQuietMilliseconds: 90_000
      },
      motionProfile: {
        energy: "medium",
        bounce: 0.2,
        gazeTracking: true,
        reducedMotionSlot: "idle"
      }
    },
    persona: {
      systemPrompt: "You are Visual Fox."
    }
  };
}

describe("CompanionPetApp home panel input actions", () => {
  it("runs home panel reading actions and shows the result", async () => {
    const onHomeAction = vi.fn().mockResolvedValue({
      headline: "Quick summary",
      body: "This paragraph introduces the core claim."
    });
    render(<CompanionPetApp greeting="Hello reader" onHomeAction={onHomeAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.click(screen.getByRole("button", { name: "Summarize this bit" }));

    expect(onHomeAction).toHaveBeenCalledWith("summarize");
    expect(await screen.findByText("This paragraph introduces the core claim.")).toBeInTheDocument();
  });

  it("submits the home panel text input", () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp greeting="Hello reader" onAnswerSubmit={onAnswerSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    const input = screen.getByLabelText("Ask something !!");
    fireEvent.change(input, { target: { value: "What is happening here?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(onAnswerSubmit).toHaveBeenCalledWith("What is happening here?");
    expect(input).toHaveValue("");
  });

  it("submits the home panel text input with Enter", () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp greeting="Hello reader" onAnswerSubmit={onAnswerSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    const input = screen.getByLabelText("Ask something !!");
    fireEvent.change(input, { target: { value: "What changed?" } });
    const enter = createEvent.keyDown(input, { key: "Enter" });
    fireEvent(input, enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(onAnswerSubmit).toHaveBeenCalledWith("What changed?");
    expect(input).toHaveValue("");
  });

  it("lets Shift+Enter stay in the home panel text input", () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp greeting="Hello reader" onAnswerSubmit={onAnswerSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    const input = screen.getByLabelText("Ask something !!");
    fireEvent.change(input, { target: { value: "Line one" } });
    const shiftEnter = createEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent(input, shiftEnter);

    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(onAnswerSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Line one");
  });

  it("shows a provider error when a home action fails", async () => {
    const onHomeAction = vi.fn().mockRejectedValue(new Error("offline"));
    render(<CompanionPetApp greeting="Hello reader" onHomeAction={onHomeAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.click(screen.getByRole("button", { name: "Why does this matter?" }));

    expect(await screen.findByText("I could not do that")).toBeInTheDocument();
    expect(screen.getByText("The reading helper could not be reached. Check your provider settings, then try again.")).toBeInTheDocument();
  });
});

describe("CompanionPetApp question panel", () => {
  it("opens the tool question panel when a question is active", async () => {
    render(<CompanionPetApp chatTheme="prediction-lilac" greeting="Hello reader" questionSession={questionSession} />);

    expect(await screen.findByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reading companion panel" })).not.toBeInTheDocument();
    expect(screen.getByText("Hello reader")).toBeInTheDocument();
    expect(screen.getByText("What caused this to happen?")).toBeInTheDocument();
  });

  it("auto-opens the question panel when a new question arrives", async () => {
    const { rerender } = render(<CompanionPetApp greeting="Hello reader" />);

    expect(screen.queryByRole("region", { name: "Companion tool panel" })).not.toBeInTheDocument();

    rerender(<CompanionPetApp greeting="Hello reader" questionSession={questionSession} />);

    expect(await screen.findByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
    expect(screen.getByText("What caused this to happen?")).toBeInTheDocument();
  });

  it("auto-opens once per prompt so manual close stays closed", async () => {
    const { rerender } = render(<CompanionPetApp greeting="Hello reader" />);

    rerender(<CompanionPetApp greeting="Hello reader" questionSession={questionSession} />);
    expect(await screen.findByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close reading companion" }));
    expect(screen.queryByRole("region", { name: "Companion tool panel" })).not.toBeInTheDocument();

    rerender(<CompanionPetApp greeting="Hello reader" questionSession={questionSession} />);
    expect(screen.queryByRole("region", { name: "Companion tool panel" })).not.toBeInTheDocument();
  });

  it("auto-opens for visible companion messages without a question session", async () => {
    const { rerender } = render(<CompanionPetApp greeting="Hello reader" />);

    rerender(
      <CompanionPetApp
        conversationMessages={[assistantConversationMessage("observation-1", "That paragraph is doing more work than it wants to admit.")]}
        greeting="Hello reader"
      />
    );

    expect(await screen.findByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
    expect(screen.getByText("That paragraph is doing more work than it wants to admit.")).toBeInTheDocument();
  });

});

describe("CompanionPetApp panel geometry", () => {
  it("attaches the panel beside the pet based on viewport position", () => {
    const { rerender } = render(<CompanionPetApp key="left-edge" />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(document.querySelector(".rc-root")).toHaveAttribute("data-panel-side", "right");

    rerender(<CompanionPetApp key="right-edge" initialPosition={{ x: window.innerWidth - 120, y: 30 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(document.querySelector(".rc-root")).toHaveAttribute("data-panel-side", "left");
  });

  it("calls back with the saved drag position", () => {
    const onPositionChange = vi.fn();
    render(<CompanionPetApp initialPosition={{ x: 20, y: 30 }} onPositionChange={onPositionChange} />);

    const pet = screen.getByRole("button", { name: "Open reading companion" });
    fireEvent.mouseDown(pet, { clientX: 24, clientY: 36 });
    fireEvent.mouseMove(window, { clientX: 84, clientY: 96 });
    fireEvent.mouseUp(window);

    expect(onPositionChange).toHaveBeenCalledWith({ x: 80, y: 90 });
  });

  it("calls back with the saved panel size", () => {
    const onPanelSizeChange = vi.fn();
    render(<CompanionPetApp initialPanelSize={{ width: 340, height: 360 }} onPanelSizeChange={onPanelSizeChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Resize companion panel" }), { clientX: 300, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 360, clientY: 370 });
    fireEvent.mouseUp(window);

    expect(onPanelSizeChange).toHaveBeenCalledWith({ width: 400, height: 430 });
  });

  it("can restore a controlled hidden page", () => {
    const onRestore = vi.fn();
    render(<CompanionPetApp hidden onRestore={onRestore} />);

    fireEvent.click(screen.getByRole("button", { name: "Show reading companion" }));

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("closes the panel when a controlled hidden page takes over", () => {
    const { rerender } = render(<CompanionPetApp />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(screen.getByRole("button", { name: "Close reading companion" })).toBeInTheDocument();

    rerender(<CompanionPetApp hidden />);
    rerender(<CompanionPetApp />);

    expect(screen.getByRole("button", { name: "Open reading companion" })).toBeInTheDocument();
  });
});

describe("CompanionPetApp active panel states", () => {
  it("shows debug details from the tool panel header when debug mode is enabled", () => {
    render(<CompanionPetApp debugMode debugSnapshot={debugSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.click(screen.getByRole("button", { name: "Open debug panel" }));
    expect(screen.getByRole("region", { name: "Companion tool panel" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reading companion panel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /debug/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Policy settings/)).toBeInTheDocument();
    expect(screen.getByText(/Last policy decision: page_load/)).toBeInTheDocument();
  });

  it("shows processing details from the debug-mode header", () => {
    render(<CompanionPetApp debugMode debugSnapshot={debugSnapshot} />);
    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    fireEvent.click(screen.getByRole("button", { name: "Open processing panel" }));

    expect(screen.getByRole("heading", { name: "Processing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open debug panel" })).toBeInTheDocument();
    expect(screen.getByText("Processed two paragraphs")).toBeInTheDocument();
    expect(screen.getByText("1 (chunk-1)")).toBeInTheDocument();
    expect(screen.getByText("probably_read:1, seen:1")).toBeInTheDocument();
    expect(screen.getByText("ambient_active_reading_v1")).toBeInTheDocument();
    expect(screen.getByText("test-provider")).toBeInTheDocument();
    expect(screen.getByText("https://models.example.test/v1")).toBeInTheDocument();
    expect(screen.getByText("test-model")).toBeInTheDocument();
    expect(screen.getAllByText("Runtime spine").length).toBeGreaterThan(0);
    expect(screen.getAllByText("background_router_enabled").length).toBeGreaterThan(0);
    expect(screen.getByText("fallback-dog")).toBeInTheDocument();
    expect(screen.getByText("info runtime: bootstrapped page")).toBeInTheDocument();
    expect(screen.getByText("3s")).toBeInTheDocument();
    expect(screen.getByText("1 PAGE_PARSED: Parsed page {\"chunks\":2}")).toBeInTheDocument();
    expect(screen.getByText(/\[last seen 1, visible 2s\] chunk-1 \[probably_read\] read:0.60/)).toBeInTheDocument();
  });
});

describe("CompanionPetApp answer panel states", () => {
  it("submits and clears the answer input", async () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp questionSession={questionSession} onAnswerSubmit={onAnswerSubmit} />);

    const input = await screen.findByLabelText("Type a quick answer...");
    fireEvent.change(input, { target: { value: "Because the premise changed." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(onAnswerSubmit).toHaveBeenCalledWith("Because the premise changed.");
    expect(input).toHaveValue("");
  });

  it("submits and clears the answer input with Enter", async () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp questionSession={questionSession} onAnswerSubmit={onAnswerSubmit} />);

    const input = await screen.findByLabelText("Type a quick answer...");
    fireEvent.change(input, { target: { value: "Because the premise changed." } });
    const enter = createEvent.keyDown(input, { key: "Enter" });
    fireEvent(input, enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(onAnswerSubmit).toHaveBeenCalledWith("Because the premise changed.");
    expect(input).toHaveValue("");
  });

  it("keeps Shift+Enter available for multiline answers", async () => {
    const onAnswerSubmit = vi.fn();
    render(<CompanionPetApp questionSession={questionSession} onAnswerSubmit={onAnswerSubmit} />);

    const input = await screen.findByLabelText("Type a quick answer...");
    fireEvent.change(input, { target: { value: "Because the premise" } });
    const shiftEnter = createEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent(input, shiftEnter);
    fireEvent.change(input, { target: { value: "Because the premise\nchanged." } });

    expect(shiftEnter.defaultPrevented).toBe(false);
    expect(onAnswerSubmit).not.toHaveBeenCalled();
    expect(input).toHaveValue("Because the premise\nchanged.");
  });
});

describe("CompanionPetApp answer panel feedback states", () => {
  it("shows retry controls for answer feedback", async () => {
    const onRetry = vi.fn();
    render(
      <CompanionPetApp
        questionSession={questionSession}
        retryDisplay={{ message: "Try once more with the central cause." }}
        onRetry={onRetry}
      />
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Try once more with the central cause.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows provider errors when no question could be generated", () => {
    const onRetry = vi.fn();
    render(
      <CompanionPetApp
        retryDisplay={{ message: "I could not reach the reading model. Check provider settings, then retry." }}
        onRetry={onRetry}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open reading companion" }));
    expect(screen.getByRole("heading", { name: "I could not ask that yet" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("I could not reach the reading model.");
    expect(screen.queryByLabelText("Ask something !!")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
