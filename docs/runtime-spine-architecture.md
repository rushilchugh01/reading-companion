# Runtime Spine Architecture

This document describes the runtime-spine foundation for Reading Companion. The goal is to make the pet unable to behave stupidly before making it clever: no stale prompts, no quiz spam, no model calls from scroll handlers, no animation-driven behavior, and no provider-specific payloads leaking into content runtime logic.

## Spine

The intended flow is:

```text
Browser signals
-> observe layer
-> heuristic evidence
-> state machines
-> decision policy
-> LLM job queue
-> provider/model client
-> result validator
-> runtime state update
-> intervention/session state
-> animation resolver
-> pet UI/avatar pack
```

The current migration wires the model boundary, queue, validation, normalized intervention contract, user chat route, reducer-derived state snapshots, and debug observability. Existing `src/content/runtime.tsx` still provides the live shell for the product, but proactive model work now flows through `intervention:compose` rather than direct question generation.

## Layer Ownership

### Shared Contracts

- `src/shared/page-types.ts`: page identity, page kinds, snapshots, chunks, URL normalization, content hashes.
- `src/shared/intervention-types.ts`: normalized intervention, answer grading, chat, page-map, and chunk-sketch contracts.
- `src/shared/model-job-types.ts`: model job kinds, priorities, TTLs, job shape, and queue config.
- `src/shared/runtime-types.ts`: minimal runtime snapshot used for stale-result validation.
- `src/shared/animation-types.ts`: animation slots and pure slot resolver.
- `src/shared/messages.ts`: background/content runtime messages, including `runtime:snapshot`, `intervention:compose`, `chat:send`, and `modelJob:cancelForPage`.

Shared files must not import content, background, UI, engine, or intervention feature modules.

### Observe, Signals, Heuristics, Context

- `src/content/observe/page-kind-classifier.ts`: deterministic page-kind classification with false-positive guards.
- `src/content/signals/signal-store.ts`: scroll, dwell, selection, tab, and viewport signal storage.
- `src/content/heuristics/junk-filter.ts`: rejects low-value page fragments.
- `src/content/heuristics/reading-signals.ts`: reading, skimming, stuck, chunk value, annoyance, and natural-pause scores.
- `src/content/context/chat-context.ts`: human-readable chat context compiler.
- `src/content/context/answer-grade-context.ts`: human-readable answer-grading context compiler.

These modules produce evidence and prompt context. They must not call the model, render UI, or mutate runtime machines.

### Content State And Policy

- `src/content/state/page.ts`: `inactive -> scanning -> ready | quiet | unsupported`.
- `src/content/state/attention.ts`: reading/skimming/stuck/note-taking/done/away reducer with hysteresis.
- `src/content/state/interaction.ts`: pet visible, bubble, chat, snooze, hidden states.
- `src/content/state/intervention.ts`: silent/candidate/waiting/queued/prompting/cooldown reducer.
- `src/content/state/question-session.ts`: active answer session lifecycle.
- `src/content/state/chat.ts`: submit routing for answer, selection help, or free chat.
- `src/content/policy/cooldown-policy.ts`: channel-specific cooldown helpers.
- `src/content/policy/pet-behavior-policy.ts`: dismissal, ignore, answer, and chat-open consequences.
- `src/content/policy/decision-policy.ts`: deterministic intervention gate and candidate-kind selection.

State reducers and policies are pure TypeScript. They decide whether an intervention is allowed; they do not compose prompts, call providers, or render cards.

### Background Queue And Model Boundary

- `src/background/queue/model-queue.ts`: priority FIFO queue with interactive/background lanes, TTLs, dedupe, cancellation, overflow handling, and settle events.
- `src/background/queue/model-job-helpers.ts`: priority, dedupe, overflow, and lane helpers.
- `src/background/model/model-result-validator.ts`: stale page/chunk/session/chat validation before applying model output.
- `src/background/model/result-normalizer.ts`: provider/tool/text output normalization.
- `src/background/model/prompts.ts`: prompt builders for intervention, answer grading, and chat.
- `src/background/model-client.ts`: app-facing model API.
- `src/background/runtime-router.ts`: all live model routes pass through `ModelQueue`.

Live background model routes now include:

- `question:generate`: legacy compatibility path queued as `intervention_compose`.
- `intervention:compose`: normalized intervention path with stale-result validation when a runtime snapshot is available.
- `answer:grade`: queued P0 grading path.
- `chat:send`: queued P0 natural text chat path.
- `modelJob:cancelForPage`: page-level queue cancellation.
- `runtime:debugModelJobs`: sanitized queue, model-call, result, validation, and error audit snapshot for the debug panel.

The live content runtime emits `runtime:snapshot` before queued intervention/chat work so stale page, chunk, and session results can be discarded.

### Persistence

- `src/background/persistence/page-history-store.ts`: last-20-page history, same-hash restore, changed-hash stale handling, eviction, asked questions, observations, cooldown memory, and intervention behavior memory.

Page history stores hashes, previews, sketches, and behavioral memory. It should not store full raw page text in v0.

### Avatar And Animation

- `src/content/avatar/corgi-packs.ts`: default and strict corgi avatar packs.
- `src/content/avatar/index.ts`: avatar exports.
- `src/shared/animation-types.ts`: animation slot resolver.

Animation is derived. It never enqueues jobs, mutates state machines, or decides product behavior. Avatar packs may influence tone, clip mapping, idle energy, motion intensity, and small threshold deltas; they must not influence extraction, validation, queue priorities, persistence, or core reading detection.

## Behavioral Contracts

The pet behavior layer distinguishes outcomes instead of flattening everything into “closed”:

- `ignored_timeout`
- `dismissed`
- `not_now`
- `answered`
- `clicked`
- `expanded`
- `converted_to_chat`
- `expired`
- `stale_discarded`

Cooldowns are channel-specific:

- `all_proactive`
- `questions`
- `predictions`
- `insights`
- `help_offers`
- `same_chunk`
- `same_page`

Important product rules:

- Explicit dismissal visibly backs off and raises the bar.
- Ignored insight suppresses insights for about 20 minutes without globally muting tutoring.
- Dismissed insight suppresses insights longer and adds a short all-proactive cooldown.
- Ignored question suppresses questions and same-chunk prompting.
- Correct answers get a cooldown; they do not trigger immediate quiz spam.
- Wrong or partial answers stay inside the active session.
- Chat open suppresses proactive prompts but allows user-authored chat.
- Same chunk should not get another proactive intervention soon after ignore or dismiss.

## Architectural Boundaries

ESLint enforces the first pass of the agreed boundaries:

- `content/observe`, `content/signals`, `content/heuristics`, `content/state`, and `content/policy` cannot import background, model, or UI modules.
- `content/avatar` cannot import background, model, or policy modules.
- `background/model`, `background/queue`, and `background/persistence` cannot import content or UI modules.
- `shared` contracts cannot import background, content, UI, engine, or intervention feature modules.

The same lint gate enforces:

- Authored files max 600 nonblank, noncomment lines.
- Functions max 60 nonblank, noncomment lines.
- Public functions keep doc comments, and new runtime-spine modules require function documentation more broadly.

## Verification

Current unit coverage includes queue, result validation, model contracts, router queue integration, page history, state machines, cooldown behavior, decision policy, heuristics, page classifier, context compiler, animation resolver, runtime-state payload builders, logger redaction, and debug-panel rendering.

Focused Playwright coverage exercises extension load, home-panel interactions, settings/debug UI, and provider-error UI. Do not use agent-browser for this repo's current verification path; use Playwright only.

Run the full local gate:

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm test
rtk npm run build
```

The build script bumps package metadata as part of release packaging. That version change is expected.

## Current Wiring

The runtime spine is now active for the model boundary:

- `src/content/runtime.tsx` builds normalized `InterventionComposeInput` values.
- `intervention:compose` can return `ask_question`, `offer_prediction`, `offer_observation`, `offer_help`, or `stay_quiet`.
- Freeform no-session text routes through `chat:send`.
- Background model work passes through `ModelQueue`.
- `ModelCallAuditLog` records sanitized inputs, results, validation decisions, provider actions, and errors.
- The debug panel shows parser, policy, provider/settings, page, state machines, model queue, recent model calls, transitions, events, logs, and visible chunks.
- Dense debug sections are collapsible and model-call/chunk timelines are full-width to avoid stretched empty cells.

Remaining product-facing migration:

1. Thin `src/content/runtime.tsx` into a true runtime-controller shell.
2. Make the new state reducers the canonical state instead of reducer-derived debug snapshots.
3. Restore and upsert `PageHistoryEntry` around page changes and intervention outcomes.
4. Resolve animation slots from runtime state and avatar pack mappings in the live UI.
5. Add richer observation/help cards instead of displaying those actions through the generic status-message path.
