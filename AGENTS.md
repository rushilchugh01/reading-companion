# Reading Companion Agent Index

@/home/ubuntu/.codex/RTK.md

Use this file as the root index for repo-specific agent orientation.

## Architecture

- Runtime spine architecture: `docs/runtime-spine-architecture.md`
- Existing implementation index: `docs/AGENTS.md`
- Asset prompt notes: `docs/assets/v0-dog-companion-prompts.md`

## Current Quality Gates

Run these before handoff:

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm test
rtk npm run build
```

The build script may bump package metadata as part of extension packaging.
