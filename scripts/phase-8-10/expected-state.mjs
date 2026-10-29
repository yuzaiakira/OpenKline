/**
 * Independent expected market state used as the oracle for stress checks.
 * Mirrors CandleStore chronological semantics without importing product code.
 */

function validateCandle(candle) {
  if (!Number.isFinite(candle.time) || candle.time < 0 || !Number.isInteger(candle.time)) {
    return "invalid-time";
  }
  if (![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
    return "invalid-ohlc";
  }
  if (candle.high < Math.max(candle.open, candle.close)) return "invalid-high";
  if (candle.low > Math.min(candle.open, candle.close)) return "invalid-low";
  if (candle.volume !== undefined && (!Number.isFinite(candle.volume) || candle.volume < 0)) {
    return "invalid-volume";
  }
  return null;
}

export function createExpectedState(initial = []) {
  const byTime = new Map();
  for (const candle of initial) {
    const reason = validateCandle(candle);
    if (reason !== null) throw new Error(`invalid initial candle: ${reason}`);
    byTime.set(candle.time, { ...candle });
  }

  const stats = {
    accepted: 0,
    rejected: 0,
    duplicatesExact: 0,
    revisions: 0,
    inserts: 0,
    appends: 0,
  };

  const sortedTimes = () => [...byTime.keys()].sort((a, b) => a - b);

  return {
    stats,
    size() {
      return byTime.size;
    },
    snapshot() {
      return sortedTimes().map((time) => ({ ...byTime.get(time) }));
    },
    closes() {
      return this.snapshot().map((candle) => candle.close);
    },
    times() {
      return sortedTimes();
    },
    apply(candle) {
      const reason = validateCandle(candle);
      if (reason !== null) {
        stats.rejected += 1;
        return { ok: false, reason };
      }
      const existing = byTime.get(candle.time);
      if (existing !== undefined) {
        const exact =
          existing.open === candle.open
          && existing.high === candle.high
          && existing.low === candle.low
          && existing.close === candle.close
          && existing.volume === candle.volume;
        if (exact) {
          stats.duplicatesExact += 1;
          stats.accepted += 1;
          return { ok: true, kind: "duplicate" };
        }
        byTime.set(candle.time, { ...candle });
        stats.revisions += 1;
        stats.accepted += 1;
        return { ok: true, kind: "revision" };
      }
      const times = sortedTimes();
      const latest = times[times.length - 1];
      if (latest === undefined || candle.time > latest) {
        stats.appends += 1;
      } else {
        stats.inserts += 1;
      }
      byTime.set(candle.time, { ...candle });
      stats.accepted += 1;
      return { ok: true, kind: latest === undefined || candle.time > latest ? "append" : "insert" };
    },
    assertChronological() {
      const times = sortedTimes();
      for (let index = 1; index < times.length; index += 1) {
        if (!(times[index] > times[index - 1])) {
          throw new Error(`non-chronological times at ${index}`);
        }
      }
      for (const candle of byTime.values()) {
        const reason = validateCandle(candle);
        if (reason !== null) throw new Error(`corrupt candle ${candle.time}: ${reason}`);
      }
    },
  };
}

export function assertSeriesEqual(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: length ${actual.length} !== ${expected.length}`);
  }
  for (let index = 0; index < actual.length; index += 1) {
    const left = actual[index];
    const right = expected[index];
    if (
      left.time !== right.time
      || left.open !== right.open
      || left.high !== right.high
      || left.low !== right.low
      || left.close !== right.close
      || left.volume !== right.volume
    ) {
      throw new Error(`${label}: mismatch at ${index} actual=${JSON.stringify(left)} expected=${JSON.stringify(right)}`);
    }
  }
}
