import { useEffect, useMemo, useState } from "react";
import type { AnimationSlot, AvatarPack, AvatarVariant } from "../shared/animation-types";
import { companionAssetUrl } from "./asset-url";
import { builtinCorgiPack, resolveRenderableAvatarVariant } from "./avatar-pack";

type CompanionPetProps = {
  pack?: AvatarPack;
  slot: AnimationSlot;
};

/** Render the active companion avatar from an animation slot and avatar pack. */
export function CompanionPet({ pack = builtinCorgiPack, slot }: CompanionPetProps) {
  const [fallbackActive, setFallbackActive] = useState(false);
  useEffect(() => setFallbackActive(false), [pack, slot]);
  const variant = useMemo(
    () => resolveRenderableAvatarVariant(fallbackActive ? builtinCorgiPack : pack, fallbackActive ? "idle" : slot),
    [fallbackActive, pack, slot]
  );
  const className = `rc-pet rc-pet--${slot}`;

  return (
    <div className={className} aria-hidden="true">
      <AvatarMedia
        variant={variant}
        onError={() => setFallbackActive(true)}
      />
      <span className="rc-pet__state" />
    </div>
  );
}

function AvatarMedia(props: { variant: AvatarVariant; onError: () => void }) {
  const src = companionAssetUrl(props.variant.src);
  if (props.variant.type === "video") {
    return (
      <video
        className="rc-pet__sprite"
        src={src}
        autoPlay
        loop={props.variant.loop ?? true}
        muted
        playsInline
        onError={props.onError}
      />
    );
  }

  return (
    <img
      className="rc-pet__sprite"
      src={src}
      alt=""
      draggable={false}
      onError={props.onError}
    />
  );
}
