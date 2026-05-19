import { createDefaultSettings } from "@/shared/defaults";
import type { CompanionSettings } from "@/shared/settings-types";
import { SettingsRepository } from "@/background/settings-repository";

function createStorage(initial?: unknown) {
  const state: Record<string, unknown> = {};
  if (initial) {
    state.companionSettings = initial;
  }
  return {
    state,
    area: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: state[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(state, items);
        return Promise.resolve();
      })
    }
  };
}

describe("SettingsRepository", () => {
  it("returns defaults when storage is empty", async () => {
    const storage = createStorage();
    const repository = new SettingsRepository(storage.area);

    await expect(repository.get()).resolves.toEqual(createDefaultSettings());
  });

  it("merges persisted partial settings with nested defaults", async () => {
    const storage = createStorage({
      showPet: false,
      interventionPolicy: { overrides: { minimumMeaningfulness: 0.2 } },
      placement: { x: 100 },
      provider: { apiKey: "secret", model: "openai/test" }
    });
    const repository = new SettingsRepository(storage.area);

    const settings = await repository.get();

    expect(settings.showPet).toBe(false);
    expect(settings.interventionPolicy.policyId).toBe("ambient_active_reading_v1");
    expect(settings.questionGenerationStrategyId).toBe("candidate_ranked_v1");
    expect(settings.interventionPolicy.overrides.minimumMeaningfulness).toBe(0.2);
    expect(settings.placement.x).toBe(100);
    expect(settings.placement.panelWidth).toBe(createDefaultSettings().placement.panelWidth);
    expect(settings.provider.apiKey).toBe("secret");
    expect(settings.provider.baseUrl).toBe(createDefaultSettings().provider.baseUrl);
  });

  it("normalizes settings before saving", async () => {
    const storage = createStorage();
    const repository = new SettingsRepository(storage.area);
    const partial = { provider: { apiKey: "abc" } };

    const saved = await repository.set(partial as CompanionSettings);

    expect(saved.provider.apiKey).toBe("abc");
    expect(saved.provider.providerName).toBe("OpenAI Compatible");
    expect(storage.state.companionSettings).toEqual(saved);
  });

  it("keeps default provider model and reasoning non-empty", () => {
    const settings = createDefaultSettings();

    expect(settings.questionGenerationStrategyId).toBe("candidate_ranked_v1");
    expect(settings.provider.model).toBeTruthy();
    expect(settings.provider.reasoningLevel).toBeTruthy();
  });

  it("persists configured provider model and reasoning level", async () => {
    const storage = createStorage();
    const repository = new SettingsRepository(storage.area);
    const settings = createDefaultSettings();

    const saved = await repository.set({
      ...settings,
      provider: {
        ...settings.provider,
        model: "custom-model-test",
        reasoningLevel: "high"
      }
    });

    expect(saved.provider.model).toBe("custom-model-test");
    expect(saved.provider.reasoningLevel).toBe("high");
    expect((storage.state.companionSettings as CompanionSettings).provider.reasoningLevel).toBe("high");
  });
});
