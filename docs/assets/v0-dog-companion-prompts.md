# v0 Dog Companion Image Prompts

Reusable ChatGPT Images / `gpt-image-2` style prompts for the first dog companion asset set.

## Shared Generation Notes

- Intended format: PNG source, post-processed to transparent PNG.
- Suggested size: `1024x1024`.
- Chroma key: flat solid `#00ff00`; remove locally after generation.
- No text, no watermark, no logo, no UI chrome.
- Keep a consistent character across both states: same small warm tan-and-cream dog, same rounded ears, same red collar, same soft storybook-3D finish.
- Keep the dog centered with generous padding so the final transparent cutout can be scaled in the extension UI.

## Asset 1

- State name: `idle_watching`
- Intended output filename: `public/assets/v0-dog-companion/idle-watching.png`
- Use case: `stylized-concept`
- Asset type: browser extension companion sprite

### Exact Prompt

```text
Use case: stylized-concept
Asset type: browser extension companion sprite
Primary request: Create a small friendly dog companion in an idle watching state for an active reading browser extension.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Subject: one small warm tan-and-cream dog with rounded floppy ears, a soft cream muzzle and chest, bright attentive eyes, and a simple red collar; the dog is seated calmly and looking slightly upward toward the reader with a gentle curious expression.
Style/medium: polished storybook 3D illustration with soft rounded shapes, clean readable silhouette, subtle fur texture, and friendly educational-app character design.
Composition/framing: centered full-body character, square 1024x1024 composition, generous transparent-ready padding on all sides, no cropping, no props.
Lighting/mood: soft even studio lighting on the dog only; calm, watchful, encouraging.
Color palette: warm tan, cream, soft brown details, red collar; do not use #00ff00 anywhere in the subject.
Text (verbatim): none.
Constraints: background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation; keep subject fully separated from the background with crisp edges; no cast shadow, no contact shadow, no reflection.
Avoid: text, watermark, logo, extra characters, props, books, glasses, speech bubbles, UI elements, harsh outlines, photorealistic dog anatomy, neon colors, background scenery.
```

## Asset 2

- State name: `thinking_asking`
- Intended output filename: `public/assets/v0-dog-companion/thinking-asking.png`
- Use case: `stylized-concept`
- Asset type: browser extension companion sprite

### Exact Prompt

```text
Use case: stylized-concept
Asset type: browser extension companion sprite
Primary request: Create the same small friendly dog companion in a thinking or asking state for an active reading browser extension.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Subject: the same small warm tan-and-cream dog with rounded floppy ears, soft cream muzzle and chest, bright attentive eyes, and simple red collar; the dog tilts its head slightly, raises one front paw as if asking a question, and has a thoughtful encouraging expression.
Style/medium: polished storybook 3D illustration with soft rounded shapes, clean readable silhouette, subtle fur texture, and friendly educational-app character design; match the idle_watching asset character exactly.
Composition/framing: centered full-body character, square 1024x1024 composition, generous transparent-ready padding on all sides, no cropping, no props.
Lighting/mood: soft even studio lighting on the dog only; curious, supportive, gently inquisitive.
Color palette: warm tan, cream, soft brown details, red collar; do not use #00ff00 anywhere in the subject.
Text (verbatim): none.
Constraints: background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation; keep subject fully separated from the background with crisp edges; no cast shadow, no contact shadow, no reflection.
Avoid: text, watermark, logo, extra characters, props, books, glasses, speech bubbles, question marks, UI elements, harsh outlines, photorealistic dog anatomy, neon colors, background scenery.
```
