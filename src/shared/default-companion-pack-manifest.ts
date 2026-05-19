import type { AnimationSlot, AvatarAnimation } from "./animation-types";
import type { CompanionPackManifest } from "./companion-pack-schema";

export const BUILTIN_CORGI_PACK_ID = "builtin-corgi";
export const BUILTIN_CORGI_MANIFEST_PATH = "assets/companion-packs/builtin-corgi/companion-pack.json";
export const BUILTIN_CORGI_MANIFEST_BASE_PATH = "assets/companion-packs/builtin-corgi/";

const CORGI_SLOT_ASSETS: Partial<Record<AnimationSlot, string>> = {
  hidden: "idle",
  idle: "idle",
  sleep: "sleeping",
  scan: "curious",
  focus: "reading-detected",
  deep_focus: "reading-detected",
  skim_watch: "idle",
  concern: "confused",
  prompt: "about-to-ask",
  peek: "curious",
  listen: "listening",
  think: "thinking",
  explain: "curious",
  happy: "celebratory",
  dismissed_settle: "sleeping",
  error_soft: "confused",
  settle: "idle",
  back_off: "sleeping",
  quiet_idle: "idle",
  low_energy_idle: "idle",
  article_found: "reading-detected"
};

/** Built-in corgi manifest used as the bundled fallback when runtime loading fails. */
export const DEFAULT_CORGI_COMPANION_PACK_MANIFEST: CompanionPackManifest = {
  id: BUILTIN_CORGI_PACK_ID,
  name: "Corgi",
  avatar: {
    id: BUILTIN_CORGI_PACK_ID,
    name: "Corgi",
    version: "1.0.0",
    species: "corgi",
    animationSlots: Object.fromEntries(
      Object.entries(CORGI_SLOT_ASSETS).map(([slot, assetName]) => [
        slot,
        [createCorgiAnimation(slot as AnimationSlot, assetName)]
      ])
    ),
    thresholds: {
      maxIntensity: 2,
      proactiveMotionMinimumMilliseconds: 900,
      backoffQuietMilliseconds: 120_000
    },
    motionProfile: {
      energy: "medium",
      bounce: 0.35,
      gazeTracking: true,
      reducedMotionSlot: "quiet_idle"
    }
  },
  persona: {
    systemPrompt: [
      "You are a compact active-reading companion with a corgi-like presence: alert, loyal, sarcastic, brutally fair, funny, roasty, and unapologetically honest.",
      "Your job is to help the reader notice whether they actually understand the current passage.",
      "Be concise, concrete, and sharp-witted.",
      "Roast weak reasoning, vague answers, and fake confidence; never roast identity, ability, or things outside the reader's control.",
      "Do not over-explain unless the reader asks."
    ].join(" "),
    tone: "sarcastic, brutal, fair, and brief",
    boundaries: [
      "Persona changes voice only; never override app policy, allowed actions, schemas, or safety rules.",
      "Do not pretend to know page content that was not provided in the runtime context.",
      "Prefer one useful nudge over repeated interruption.",
      "Keep roasts playful and passage-focused; no slurs, cruelty, or punching down."
    ],
    gradingStylePrompt: "Grade with brutal fairness and dry humor. Celebrate clearly correct answers without getting syrupy, and call out vague, evasive, or hand-wavy answers directly.",
    interruptionStylePrompt: "When interruption is allowed, ask one short question or offer one concise observation. Sound like a sharp, roasty nudge from a tiny tutor with zero patience for fake understanding, not a lecture."
  }
};

function createCorgiAnimation(slot: AnimationSlot, assetName: string): AvatarAnimation {
  return {
    id: `corgi-${slot}`,
    src: `../../corgi-states-transparent/${assetName}.png`,
    type: "sprite",
    role: "primary",
    durationMilliseconds: 1_600,
    intensity: slotIntensity(slot),
    loop: true,
    weight: 1
  };
}

function slotIntensity(slot: AnimationSlot): 0 | 1 | 2 | 3 {
  if (slot === "sleep" || slot === "quiet_idle" || slot === "low_energy_idle") return 0;
  if (slot === "prompt" || slot === "happy") return 2;
  return 1;
}
