import type { PetStateKey } from "../shared/companion-types";
import { corgiSpriteUrl } from "./asset-url";

type DogPetProps = {
  state: PetStateKey;
};

const STATE_SPRITES: Record<PetStateKey, string> = {
  about_to_ask: "about-to-ask",
  celebratory: "celebratory",
  confused: "confused",
  curious: "curious",
  debug_active: "curious",
  grading: "grading",
  idle: "idle",
  listening: "listening",
  reading_detected: "reading-detected",
  sleeping: "sleeping",
  thinking: "thinking"
};

function spriteForState(state: PetStateKey): string {
  return corgiSpriteUrl(STATE_SPRITES[state]);
}

/** Render the fallback dog avatar used before sprite or animation packs exist. */
export function DogPet({ state }: DogPetProps) {
  return (
    <div className={`rc-dog rc-dog--${state}`} aria-hidden="true">
      <img className="rc-dog__sprite" src={spriteForState(state)} alt="" draggable={false} />
      <span className="rc-dog__state" />
    </div>
  );
}
