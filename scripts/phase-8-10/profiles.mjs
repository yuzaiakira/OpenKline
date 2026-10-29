/** Stress profiles: correctness is event/seed based; duration is an optional ceiling. */
export const PROFILES = {
  ci: {
    name: "ci",
    seed: 0x81010c1,
    eventCount: 4_000,
    maxDurationMs: 120_000,
    sampleEveryEvents: 500,
    candleBases: [1_000, 10_000],
    browserInteractionRounds: 8,
    browserSetDatafeedRounds: 12,
    advancedModuleRounds: 40,
  },
  local: {
    name: "local",
    seed: 0x81010c1,
    eventCount: 80_000,
    maxDurationMs: 5 * 60_000,
    sampleEveryEvents: 2_000,
    candleBases: [1_000, 10_000, 100_000],
    browserInteractionRounds: 24,
    browserSetDatafeedRounds: 40,
    advancedModuleRounds: 200,
  },
  soak: {
    name: "soak",
    seed: 0x81010c1,
    // Event budget keeps correctness independent of wall clock; duration is a soft ceiling.
    eventCount: 1_200_000,
    maxDurationMs: 30 * 60_000,
    sampleEveryEvents: 10_000,
    candleBases: [1_000, 10_000, 100_000],
    browserInteractionRounds: 60,
    browserSetDatafeedRounds: 80,
    advancedModuleRounds: 800,
  },
};

export function resolveProfile(name = process.env.OPENKLINE_STRESS_PROFILE ?? "ci") {
  const profile = PROFILES[name];
  if (profile === undefined) {
    throw new Error(`Unknown stress profile "${name}". Expected one of: ${Object.keys(PROFILES).join(", ")}`);
  }
  const seed = process.env.OPENKLINE_STRESS_SEED !== undefined
    ? Number.parseInt(process.env.OPENKLINE_STRESS_SEED, 10)
    : profile.seed;
  const eventCount = process.env.OPENKLINE_STRESS_EVENTS !== undefined
    ? Number.parseInt(process.env.OPENKLINE_STRESS_EVENTS, 10)
    : profile.eventCount;
  const maxDurationMs = process.env.OPENKLINE_STRESS_MAX_MS !== undefined
    ? Number.parseInt(process.env.OPENKLINE_STRESS_MAX_MS, 10)
    : profile.maxDurationMs;
  if (!Number.isFinite(seed) || !Number.isFinite(eventCount) || !Number.isFinite(maxDurationMs)) {
    throw new Error("Invalid OPENKLINE_STRESS_* overrides");
  }
  return { ...profile, seed, eventCount, maxDurationMs };
}
