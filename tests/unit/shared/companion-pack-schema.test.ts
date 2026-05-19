import { describe, expect, it, vi } from "vitest";
import { resolveAvatarSlotConfig } from "../../../src/shared/animation-types";
import { companionPackFromManifest } from "../../../src/shared/companion-pack-schema";
import { loadCompanionPack, listCompanionPacks } from "../../../src/shared/companion-packs";
import {
  normalizeCompanionPackRegistry,
  resolveCompanionPackEntry
} from "../../../src/shared/companion-pack-registry";
import type { CompanionPackManifest } from "../../../src/shared/companion-pack-schema";

const catManifest: CompanionPackManifest = {
  id: "study-cat",
  name: "Study Cat",
  avatar: {
    id: "study-cat",
    name: "Study Cat",
    version: "1.0.0",
    species: "cat",
    animationSlots: {
      idle: [{ id: "cat-idle", src: "idle.webp", type: "animated-webp", role: "primary" }],
      think: [{ id: "cat-think", src: "motion/think.webp", type: "animated-webp", role: "primary" }]
    },
    thresholds: {
      maxIntensity: 2,
      proactiveMotionMinimumMilliseconds: 1_000,
      backoffQuietMilliseconds: 90_000
    },
    motionProfile: {
      energy: "medium",
      bounce: 0.2,
      gazeTracking: true,
      reducedMotionSlot: "idle"
    }
  },
  persona: {
    systemPrompt: "You are a quiet study cat.",
    gradingStylePrompt: "Grade precisely.",
    interruptionStylePrompt: "Interrupt softly."
  }
};

describe("companion pack registry", () => {
  it("exposes one bundled default pack in the registry", () => {
    const entries = listCompanionPacks();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "builtin-corgi",
      source: "bundled",
      enabled: true
    });
  });

  it("normalizes a registry with one active pack among multiple entries", () => {
    const registry = normalizeCompanionPackRegistry({
      activePackId: "study-cat",
      entries: [{
        id: "study-cat",
        name: "Study Cat",
        version: "1.0.0",
        source: "remote",
        manifestPath: "https://packs.example/study-cat-registry/companion-pack.json",
        enabled: true
      }]
    });

    expect(registry.activePackId).toBe("study-cat");
    expect(registry.entries.map((entry) => entry.id)).toEqual(["builtin-corgi", "study-cat"]);
    expect(resolveCompanionPackEntry(registry, undefined).id).toBe("study-cat");
  });
});

describe("companion pack manifests", () => {
  it("materializes generic slots with manifest-relative asset paths", () => {
    const pack = companionPackFromManifest(catManifest, "assets/companion-packs/study-cat/");

    expect(pack.avatar.animationSlots.idle?.[0]?.src).toBe(
      "/assets/companion-packs/study-cat/idle.webp"
    );
    expect(resolveAvatarSlotConfig(pack.avatar, "think")?.[0]?.src).toBe(
      "/assets/companion-packs/study-cat/motion/think.webp"
    );
  });

  it("loads remote manifest packs without code-level registration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(catManifest)
    } as Response);

    const pack = await loadCompanionPack("https://packs.example/study-cat/companion-pack.json");

    expect(pack.id).toBe("study-cat");
    expect(pack.persona.interruptionStylePrompt).toBe("Interrupt softly.");
    expect(pack.avatar.animationSlots.think?.[0]?.src).toBe(
      "https://packs.example/study-cat/motion/think.webp"
    );
    fetchMock.mockRestore();
  });

  it("loads a registered active pack from a registry", async () => {
    const registry = normalizeCompanionPackRegistry({
      activePackId: "study-cat",
      entries: [{
        id: "study-cat",
        name: "Study Cat",
        version: "1.0.0",
        source: "remote",
        manifestPath: "https://packs.example/study-cat-registry/companion-pack.json",
        enabled: true
      }]
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(catManifest)
    } as Response);

    const pack = await loadCompanionPack(undefined, registry);

    expect(pack.id).toBe("study-cat");
    expect(fetchMock).toHaveBeenCalledWith("https://packs.example/study-cat-registry/companion-pack.json");
    fetchMock.mockRestore();
  });
});
