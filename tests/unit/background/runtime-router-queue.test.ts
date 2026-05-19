import { RuntimeMessageRouter } from "@/background/runtime-router";
import { BackgroundDatabaseRepository } from "@/background/database-repository";
import { ModelClient } from "@/background/model-client";
import type { PiModelResult, PiRequest } from "@/background/pi-model-provider";
import { SettingsRepository } from "@/background/settings-repository";
import { createDefaultSettings } from "@/shared/defaults";
import type { ChatSendInput, InterventionComposeInput } from "@/shared/intervention-types";
import type { RuntimeMessage } from "@/shared/messages";
import type { ModelQueueDebugSnapshot } from "@/shared/model-job-types";

type DeferredResult = {
  promise: Promise<PiModelResult>;
  resolve: (value: PiModelResult) => void;
};

function createDeferredResult(): DeferredResult {
  let resolve!: (value: PiModelResult) => void;
  const promise = new Promise<PiModelResult>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function createStorage() {
  const state = { companionSettings: createDefaultSettings() };
  return {
    get: vi.fn((key: string) => Promise.resolve({ [key]: state.companionSettings })),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(state, items);
      return Promise.resolve();
    })
  };
}

function createRouter(piRunner: (request: PiRequest) => Promise<PiModelResult>) {
  return new RuntimeMessageRouter({
    settings: new SettingsRepository(createStorage()),
    database: new BackgroundDatabaseRepository({ databaseName: `router-test-${crypto.randomUUID()}` }),
    model: new ModelClient({ piRunner })
  });
}

function questionMessage(): RuntimeMessage {
  return {
    type: "question:generate",
    payload: {
      chunkText: "A dense paragraph about memory retrieval.",
      heading: "Article",
      personaId: "brutal-tutor-dog",
      readGatingMode: "balanced",
      opportunity: {
        targetChunkId: "chunk-1",
        reason: "dense_pause",
        confidence: 0.8,
        suggestedMoves: ["ask_question"],
        policyId: "ambient_active_reading_v1"
      }
    }
  };
}

function interventionInput(): InterventionComposeInput {
  return {
    requestId: "request-1",
    tabId: 7,
    pageId: "page-1",
    contentHash: "hash-1",
    chunkId: "chunk-1",
    page: { title: "Article" },
    currentPassage: { chunkId: "chunk-1", text: "The key claim is here." },
    readerState: {},
    policy: {
      policyId: "ambient_active_reading_v1",
      allowedActions: ["ask_question"]
    },
    companionStyle: { companionPackId: "builtin-corgi", personaId: "brutal-tutor-dog" },
    history: [],
    expiresAt: Date.now() + 20_000
  };
}

function chatInput(): ChatSendInput {
  return {
    requestId: "chat-1",
    tabId: 3,
    pageId: "page-1",
    page: { title: "Article" },
    companionStyle: { companionPackId: "builtin-corgi", personaId: "brutal-tutor-dog" },
    history: [{ role: "user", content: "hello" }],
    message: "explain this"
  };
}

function debugSnapshotValue(result: Awaited<ReturnType<RuntimeMessageRouter["route"]>>): ModelQueueDebugSnapshot {
  expect(result.ok).toBe(true);
  return result.value as ModelQueueDebugSnapshot;
}

describe("RuntimeMessageRouter model queue boundary", () => {
  it("routes legacy question generation through cancellable queue jobs", async () => {
    const router = createRouter(() => new Promise<PiModelResult>(() => {}));

    const pendingQuestion = router.route(questionMessage());
    const cancelResult = await router.route({
      type: "modelJob:cancelForPage",
      payload: { pageId: "Article" }
    });
    const questionResult = await pendingQuestion;

    expect(cancelResult).toMatchObject({ ok: true });
    expect(questionResult.ok).toBe(false);
    expect(questionResult.error).toContain("cancelled");
  });

  it("validates normalized intervention results against the latest runtime snapshot", async () => {
    const router = createRouter(() => Promise.resolve({
      text: JSON.stringify({
        action: "ask_question",
        userFacingText: "What changed here?",
        expectedAnswer: "The retrieval condition changed.",
        petIntent: "curious",
        reasonForApp: "High-value paragraph.",
        confidence: 0.9
      }),
      toolCalls: []
    }));

    await router.route({
      type: "runtime:snapshot",
      payload: { now: Date.now(), tabId: 7, pageId: "page-1", contentHash: "hash-1", activeChunkId: "chunk-2" }
    });
    const result = await router.route({ type: "intervention:compose", payload: interventionInput() });

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({
      action: "stay_quiet",
      reasonForApp: "discarded_chunk_changed"
    });
  });

  it("routes freeform chat through the natural text model path", async () => {
    const piRunner = vi.fn((request: PiRequest) => Promise.resolve({
      text: request.responseFormat === "text" && request.tools === "none" ? "  Natural reply.  " : "",
      toolCalls: []
    }));
    const router = createRouter(piRunner);

    const result = await router.route({ type: "chat:send", payload: chatInput() });

    expect(result).toMatchObject({ ok: true, value: { requestId: "chat-1", text: "Natural reply." } });
    expect(piRunner).toHaveBeenCalledWith(expect.objectContaining({ responseFormat: "text", tools: "none" }));
  });
});

describe("RuntimeMessageRouter debug model snapshot", () => {
  it("exposes a sanitized running queue snapshot for debug tooling", async () => {
    const deferred = createDeferredResult();
    const router = createRouter(() => deferred.promise);
    const pendingChat = router.route({
      type: "chat:send",
      payload: {
        ...chatInput(),
        message: "explain this with Bearer sk-chat-secret_12345678"
      }
    });
    await Promise.resolve();

    const snapshot = debugSnapshotValue(await router.route({ type: "runtime:debugModelJobs" }));
    const record = snapshot.jobs.find((job) => job.kind === "user_chat");

    expect(snapshot.counts.running).toBe(1);
    expect(record).toMatchObject({
      kind: "user_chat",
      status: "running",
      priority: 0,
      pageId: "page-1",
      conversationId: "chat-1",
      validationResult: { status: "not_checked" }
    });
    expect(JSON.stringify(snapshot)).not.toContain("sk-chat-secret");

    deferred.resolve({ text: "done", toolCalls: [] });
    await expect(pendingChat).resolves.toMatchObject({ ok: true });
  });
});

describe("RuntimeMessageRouter model-call audit", () => {
  it("audits model result actions and stale validation decisions", async () => {
    const router = createRouter(() => Promise.resolve({
      text: JSON.stringify({
        action: "ask_question",
        userFacingText: "What changed here?",
        expectedAnswer: "The retrieval condition changed.",
        petIntent: "curious",
        reasonForApp: "High-value paragraph.",
        confidence: 0.9
      }),
      toolCalls: []
    }));

    await router.route({
      type: "runtime:snapshot",
      payload: { now: Date.now(), tabId: 7, pageId: "page-1", contentHash: "hash-1", activeChunkId: "chunk-2" }
    });
    await router.route({
      type: "intervention:compose",
      payload: {
        ...interventionInput(),
        currentPassage: {
          ...interventionInput().currentPassage,
          text: "Secret passage Bearer sk-input-secret_12345678"
        }
      }
    });

    const snapshot = debugSnapshotValue(await router.route({ type: "runtime:debugModelJobs" }));
    const record = snapshot.recentModelCalls.find((job) => job.kind === "intervention_compose");

    expect(record).toMatchObject({
      status: "completed",
      providerAction: "ask_question",
      toolAction: "ask_question",
      validationResult: { status: "invalid", reason: "chunk_changed" }
    });
    expect(record?.completedAt).toEqual(expect.any(Number));
    expect(JSON.stringify(snapshot)).not.toContain("sk-input-secret");
  });

  it("audits provider failures without leaking secret-shaped error text", async () => {
    const router = createRouter(() => Promise.reject(new Error("authorization Bearer sk-error-secret_12345678")));

    const result = await router.route({ type: "chat:send", payload: chatInput() });
    const snapshot = debugSnapshotValue(await router.route({ type: "runtime:debugModelJobs" }));
    const record = snapshot.recentModelCalls.find((job) => job.kind === "user_chat");

    expect(result).toMatchObject({ ok: false });
    expect(record).toMatchObject({
      status: "failed"
    });
    expect(record?.error).toContain("[REDACTED]");
    expect(JSON.stringify(snapshot)).not.toContain("sk-error-secret");
  });
});
