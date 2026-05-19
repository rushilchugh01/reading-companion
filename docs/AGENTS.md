# Active Reading Companion Implementation Index

This document is a fast orientation guide for agents working in this repo. It maps the implemented layers to their files, explains the main runtime flow, and lists verification gates that should stay green.

## Project Shape

- Browser extension stack: WXT, React, TypeScript, Chrome MV3 first.
- UI runtime: content script injects a fixed draggable companion pet and compact panel.
- Background runtime: settings, IndexedDB persistence, queued PI-backed model calls, weak concepts, debug events, and sanitized model-call audit snapshots.
- Local-first default: no login, local storage, user-provided OpenAI-compatible API settings.
- Current LLM package: `@earendil-works/pi-ai` behind our own background `ModelClient`.

## Entry Points

- `entrypoints/content.tsx`: mounts the content runtime into pages.
- `entrypoints/background.ts`: starts background services and message router.
- `entrypoints/options/main.tsx`: settings/options page.
- `wxt.config.ts`: extension manifest, permissions, host permissions, public assets.

## Shared Types And Defaults

- `src/shared/settings-types.ts`: persisted settings, provider config, pet placement.
- `src/shared/defaults.ts`: local-first defaults and local OpenAI-compatible provider defaults.
- `src/shared/messages.ts`: typed runtime messages between content and background.
- `src/shared/reading-types.ts`: chunk, reading state, scores, content type.
- `src/shared/session-types.ts`: question sessions, grading labels, weak concepts.
- `src/shared/debug-types.ts`: debug snapshot and debug event contracts.
- `src/shared/intervention-types.ts`: normalized `intervention:compose`, answer grading, chat, page-map, and chunk-sketch contracts.
- `src/shared/model-job-types.ts`: background queue kinds, priorities, TTLs, job records, and debug snapshots.
- `src/shared/runtime-types.ts`: runtime freshness snapshot used for stale-result validation.
- `src/shared/companion-types.ts`: pet state keys used by the live UI/runtime.

## Avatar And Assets

- `src/ui/CompanionPet.tsx`: renders the active avatar pack from resolved animation slots.
- `src/ui/avatar-pack.ts`: built-in corgi avatar pack that reuses the current PNG assets.
- `public/assets/corgi-states-transparent/*.png`: shipped transparent corgi sprites.
- `assets/source/corgi-states-original/*.png`: original generated source sprites, not shipped.
- `assets/source/v0-dog-companion/*.png`: older source dog assets, not shipped.
- `docs/assets/v0-dog-companion-prompts.md`: earlier asset prompt notes.

Asset note: transparent sprites were generated with `rembg`. Originals are kept outside `public/` so WXT does not copy them into the built extension.

## Content Runtime

- `src/content/runtime.tsx`: live content shell. It parses the page, reads signals, evaluates current policy, emits `runtime:snapshot`, calls `intervention:compose`, routes no-session text through `chat:send`, and feeds the debug panel.
- `src/content/runtime-state.ts`: pure builders for runtime identity, freshness snapshots, intervention compose payloads, chat payloads, question-session mapping, and reducer-derived state-machine snapshots.
- `src/content/runtime-debug.ts`: debug snapshot assembly, including state machines, queue/model-call audit data, logs, events, chunks, and provider/runtime metadata.
- `src/engine/parser.ts`: extracts chunks from headings, paragraphs, lists, code, tables, dense regions, and PDF-like fallback surfaces.
- `src/engine/signals.ts`: focus, visibility, scroll, dwell, selection, copy, revisit, and viewport exposure signals.
- `src/engine/scoring.ts`: reading confidence, meaningfulness, intervention readiness scoring.
- `src/engine/state.ts`: chunk reading-state transitions.
- `src/engine/index.ts`: engine exports.

Reading states currently include `unseen`, `seen`, `skimmed`, `probably_read`, `deep_read`, `stuck_or_confused`, and `abandoned`.

## Intervention Layer

- `src/intervention/candidates.ts`: converts scored chunks into intervention candidates.
- `src/intervention/policy.ts`: slottable policy packs, app-level guardrails, opportunities, suggested cognitive moves.
- `src/intervention/session.ts`: question session lifecycle helpers.
- `src/intervention/grading.ts`: deterministic local grading fallback.
- `src/intervention/weak-concepts.ts`: weak-concept creation helpers.
- `src/intervention/types.ts`: intervention layer types.
- `src/intervention/index.ts`: intervention exports.

Important split: deterministic app policy decides whether interruption is allowed; persona/model/tooling decides how to phrase an allowed interaction.

Implemented policy packs:

- `ambient_active_reading_v1`: default balanced active-reading behavior.
- `gentle_checkpoints`: slower, quieter section-checkpoint behavior.
- `brutal_tutor_dense`: more willing to ask on dense/high-value chunks.

Policy settings live at `CompanionSettings.interventionPolicy` and support threshold overrides. The options page exposes policy pack, minimum meaningfulness, minimum reading confidence, and page-load quiet milliseconds.

## Background Layer

- `src/background/runtime-router.ts`: handles settings, `runtime:snapshot`, `runtime:debugModelJobs`, `intervention:compose`, `answer:grade`, `chat:send`, page-job cancellation, weak concepts, and debug events.
- `src/background/queue/model-queue.ts`: priority model queue with TTLs, dedupe, concurrency lanes, cancellation, overflow, and settle events.
- `src/background/model/model-call-audit.ts`: sanitized queue/job/model-call audit log for debug tooling.
- `src/background/model/model-result-validator.ts`: stale page/chunk/session/chat validation before applying queued model output.
- `src/background/model/result-normalizer.ts`: normalized model/tool/text output parser.
- `src/background/model/prompts.ts`: intervention, answer-grade, and chat prompt builders.
- `src/background/settings-repository.ts`: `chrome.storage.local` settings persistence and migrations/default merging.
- `src/background/database-repository.ts`: IndexedDB weak concept and debug event persistence.
- `src/background/model-client.ts`: stable app-facing model API with deterministic fallback.
- `src/background/pi-model-provider.ts`: PI OpenAI-compatible provider adapter.
- `src/background/companion-tools.ts`: model tool catalogue and tool-call normalization.

## PI And Model Tools

The app sends tools to the LLM through PI. Normalized intervention actions are:

- `ask_question`: ask one read-gated active-reading question.
- `offer_prediction`: ask the reader to predict what comes next.
- `offer_observation`: offer a concise insight/observation.
- `offer_help`: offer to unpack a dense passage without asking for an answer.
- `stay_quiet`: explicitly decline to intervene.

Answer grading uses `grade_answer`. Freeform chat uses `chat:send` natural text and should not expose intervention tools by default.

Policy warning: model tools are requests, not authority. Cooldowns, read-gating, privacy, disable settings, validation, and dismissal backoff remain app-level rules. The model never owns animation state.

PI warning: WXT build emits a non-fatal warning because PI's browser-safe env-key helper references `node:fs`. Avoid importing node-only PI providers into content scripts.

## UI Layer

- `src/ui/CompanionPetApp.tsx`: draggable pet anchor, panel open/minimize, panel resizing, placement callbacks.
- `src/ui/DebugProcessingPanel.tsx`: collapsible comprehensive debug dashboard for parser, policy, runtime spine, state machines, model queue, model calls, transitions, events, logs, and chunks.
- `src/ui/CompanionPet.tsx`: generic avatar-pack renderer.
- `src/ui/content.css`: isolated content-script styles, chat themes, pet/panel polish.
- `src/ui/geometry.ts`: viewport clamping and panel placement helpers.
- `src/ui/types.ts`: UI props, panel tabs, panel size, chat themes.
- `src/ui/index.ts`: UI exports.

Implemented chat themes:

- `prediction-lilac`
- `mint-explain`
- `note-card`
- `sky-celebrate`
- `peach-check`

Default panel theme is `mint-explain`.

## Settings And Provider Defaults

Provider settings live in `CompanionSettings.provider`:

- `baseUrl`
- `model`
- `providerName`
- `timeout`
- `maxTokens`
- `temperature`

Default provider is the local OpenAI-compatible proxy at `http://127.0.0.1:8318/v1` with `gemini-3-flash-preview`.

## Tests

- `tests/background/model-client.test.ts`: PI/tool adapter, request shape, normalized intervention, chat, provider errors, and grading.
- `tests/unit/background/runtime-router-queue.test.ts`: queue boundary, stale validation, debug job snapshots, provider failure audit.
- `tests/unit/content/runtime-state.test.ts`: compose payloads, chat payloads, runtime snapshots, and machine snapshots.
- `tests/ui/DebugProcessingPanel.test.tsx`: rich and fallback debug dashboard rendering, collapsible sections.
- `tests/background/settings-repository.test.ts`: settings persistence/default merging.
- `tests/background/database-repository.test.ts`: IndexedDB repository behavior.
- `tests/engine/parser.test.ts`: chunk extraction.
- `tests/engine/scoring.test.ts`: score calculations.
- `tests/engine/state.test.ts`: reading-state transitions.
- `tests/intervention/intervention.test.ts`: policy, candidate, grading, weak-concept flow.
- `tests/ui/CompanionPetApp.test.tsx`: pet visibility, panel behavior, drag persistence, debug tab, answer submission, theme slotting.
- `tests/e2e/extension-load.spec.ts`: Playwright unpacked extension load and fixture smoke.
- `tests/e2e/extension-harness.ts`: Playwright Chromium extension harness helpers.
- `tests/fixtures/*.html`: article, docs, README, code, math, PDF-like fixtures.

## Quality Gates

Run these before handoff:

```bash
npm run typecheck
npm run lint
npm run check:size
npm run test
npm run build
npm run test:e2e
```

`npm run check` covers typecheck, lint, size, unit tests, and build. It does not run Playwright e2e.

## Browser Verification

Use Playwright only for extension/browser verification. Do not use agent-browser for this repo's current QA path.

## File Size And Style Rules

- Authored app/test files must stay under 600 lines.
- Functions/methods must stay under 60 lines.
- Prefer clear exported APIs with doc comments.
- Use `rg`/`rg --files` for search.
- Use `apply_patch` for manual edits.
- Do not move original user assets into `public/` unless they should ship.

## Runtime Flow

1. Content script mounts `ContentCompanionRuntime`.
2. Runtime loads settings and parser state.
3. Parser extracts readable chunks.
4. Signals track visibility, scroll, focus, selection, dwell, and revisits.
5. Engine scores chunks and classifies reading state.
6. Intervention policy approves or suppresses candidates.
7. Approved proactive work emits `runtime:snapshot` and goes through background `intervention:compose`.
8. Background queues the model job, calls PI through `ModelClient`, normalizes the result, validates freshness, and records the audit trail.
9. `ask_question` and `offer_prediction` become question sessions; `offer_observation` and `offer_help` currently surface as assistant/status messages.
10. No-session home text goes through `chat:send`.
11. User answers route to queued `answer:grade`.
12. Weak answers can create weak concepts and debug events.
13. The debug panel can inspect state machines, queue state, model calls, validation, results, errors, logs, and chunks.

## Known Next Steps

- Add a streaming `runtime.Port` path so PI `thinking_delta`, `text_delta`, and `toolcall_delta` can animate pet state in real time.
- Make reducer state canonical in a dedicated runtime controller instead of reducer-derived debug snapshots.
- Add first-class observation/help cards for `offer_observation` and `offer_help`.
- Add privacy-safe prompt/debug export modes for model payload inspection.
- Add provider/model selector UX for PI-compatible providers.
- Expand PDF support beyond best-effort visible text.
- Add privacy-safe debug export modes.
