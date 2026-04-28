const keys = [
  process.env.GEMINI_KEY_1,
  process.env.GEMINI_KEY_2,
  process.env.GEMINI_KEY_3,
  process.env.GEMINI_KEY_4,
  process.env.GEMINI_KEY_5,
].filter((k): k is string => Boolean(k));

if (keys.length === 0) {
  throw new Error("No GEMINI_KEY_* env vars found");
}

let index = 0;
const cooldowns = new Map<number, number>();

export const nextKey = (): string => {
  for (let i = 0; i < keys.length; i++) {
    const slot = (index + i) % keys.length;
    const cooldownUntil = cooldowns.get(slot) ?? 0;
    if (Date.now() >= cooldownUntil) {
      index = slot + 1;
      return keys[slot];
    }
  }
  index = (index + 1) % keys.length;
  return keys[index];
};

export const markCooldown = (key: string, durationMs = 60_000) => {
  const slot = keys.indexOf(key);
  if (slot >= 0) cooldowns.set(slot, Date.now() + durationMs);
};