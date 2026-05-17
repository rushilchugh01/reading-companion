import { createContext, useContext, type ReactNode } from "react";
import type { AvatarPack } from "../shared/animation-types";
import { builtinCorgiPack } from "./avatar-pack";

const ActiveAvatarPackContext = createContext<AvatarPack>(builtinCorgiPack);

/** Provides the selected avatar pack to pet and panel avatar renderers. */
export function ActiveAvatarPackProvider(props: { children: ReactNode; pack: AvatarPack }) {
  return (
    <ActiveAvatarPackContext.Provider value={props.pack}>
      {props.children}
    </ActiveAvatarPackContext.Provider>
  );
}

/** Returns the selected avatar pack, falling back to the bundled corgi pack. */
export function useActiveAvatarPack(): AvatarPack {
  return useContext(ActiveAvatarPackContext);
}
