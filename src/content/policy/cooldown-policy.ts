export type CooldownChannel =
  | "all_proactive"
  | "questions"
  | "predictions"
  | "insights"
  | "help_offers"
  | "same_chunk"
  | "same_page";

export type CooldownEntry = {
  until: number;
  source?: string;
};

export type CooldownState = Partial<Record<CooldownChannel, CooldownEntry>>;

export type SetCooldownInput = {
  channel: CooldownChannel;
  now: number;
  durationMs: number;
  source?: string;
};

/** Returns true when the named cooldown has not expired yet. */
export function isCooldownActive(
  cooldowns: CooldownState,
  channel: CooldownChannel,
  now: number
): boolean {
  return (cooldowns[channel]?.until ?? 0) > now;
}

/** Returns the positive remaining cooldown duration, or zero when inactive. */
export function getCooldownRemainingMs(
  cooldowns: CooldownState,
  channel: CooldownChannel,
  now: number
): number {
  return Math.max(0, (cooldowns[channel]?.until ?? 0) - now);
}

/** Adds or extends one cooldown without shortening an existing longer one. */
export function setCooldown(
  cooldowns: CooldownState,
  input: SetCooldownInput
): CooldownState {
  const currentUntil = cooldowns[input.channel]?.until ?? 0;
  const nextUntil = input.now + input.durationMs;

  return {
    ...cooldowns,
    [input.channel]: {
      until: Math.max(currentUntil, nextUntil),
      source: input.source
    }
  };
}

/** Adds or extends multiple cooldown channels from duration values. */
export function setCooldowns(
  cooldowns: CooldownState,
  now: number,
  updates: Partial<Record<CooldownChannel, number>>,
  source?: string
): CooldownState {
  let next = cooldowns;
  for (const channel of Object.keys(updates) as CooldownChannel[]) {
    const duration = updates[channel];
    if (duration !== undefined) {
      next = setCooldown(next, { channel, now, durationMs: duration, source });
    }
  }

  return next;
}
