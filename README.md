# Active Reading Companion

A Chrome-first MV3 extension that adds a local-first active reading pet to pages.

It is built for active reading practice: the companion watches for moments where a
reader may benefit from a small check-in, asks a question, and follows up on the
answer with feedback, hints, or an explanation.

The companion is character-driven. Avatar packs can define different mascots,
animations, persona copy, grading tone, question-style bias, and interruption
cadence, so the same active reading engine can support different reading
characters instead of one fixed assistant personality.

## Commands

- `npm run dev` starts WXT development mode.
- `npm run build` builds the unpacked extension.
- `npm run test` runs unit and component tests.
- `npm run test:e2e` runs Playwright extension tests.
- `npm run check` runs typecheck, lint, size checks, tests, and build.

## Local files and PDFs

Chrome requires users to enable file URL access for extensions. Open
`chrome://extensions`, choose this extension, and enable "Allow access to file URLs".
