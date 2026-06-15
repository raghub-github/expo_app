type WeatherMonitoringState = {
  apiCallsTotal: number;
  apiSuccessTotal: number;
  apiFailureTotal: number;
  cacheHits: number;
  cacheMisses: number;
  staleFallbacks: number;
  refreshFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  latencySamples: number;
  _latencySum: number;
};

const state: WeatherMonitoringState = {
  apiCallsTotal: 0,
  apiSuccessTotal: 0,
  apiFailureTotal: 0,
  cacheHits: 0,
  cacheMisses: 0,
  staleFallbacks: 0,
  refreshFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  lastLatencyMs: null,
  avgLatencyMs: null,
  latencySamples: 0,
  _latencySum: 0,
};

export function recordWeatherApiCallStart(): void {
  state.apiCallsTotal += 1;
}

export function recordWeatherApiSuccess(latencyMs: number): void {
  state.apiSuccessTotal += 1;
  state.lastSuccessAt = new Date().toISOString();
  state.lastLatencyMs = latencyMs;
  state.latencySamples += 1;
  state._latencySum += latencyMs;
  state.avgLatencyMs = Math.round(state._latencySum / state.latencySamples);
}

export function recordWeatherApiFailure(reason: string): void {
  state.apiFailureTotal += 1;
  state.lastFailureAt = new Date().toISOString();
  state.lastFailureReason = reason.slice(0, 200);
}

export function recordWeatherCacheHit(): void {
  state.cacheHits += 1;
}

export function recordWeatherCacheMiss(): void {
  state.cacheMisses += 1;
}

export function recordWeatherStaleFallback(): void {
  state.staleFallbacks += 1;
}

export function recordWeatherRefreshFailure(): void {
  state.refreshFailures += 1;
}

export function getWeatherMonitoringSnapshot(extra?: {
  zoneSnapshotCount?: number;
  apiKeyConfigured?: boolean;
}) {
  const cacheTotal = state.cacheHits + state.cacheMisses;
  const cacheHitRatio = cacheTotal > 0 ? state.cacheHits / cacheTotal : null;
  const apiSuccessRate =
    state.apiCallsTotal > 0 ? state.apiSuccessTotal / state.apiCallsTotal : null;

  return {
    ok: true,
    apiKeyConfigured: extra?.apiKeyConfigured ?? false,
    zoneSnapshotCount: extra?.zoneSnapshotCount ?? null,
    metrics: {
      apiCallsTotal: state.apiCallsTotal,
      apiSuccessTotal: state.apiSuccessTotal,
      apiFailureTotal: state.apiFailureTotal,
      apiSuccessRate,
      cacheHits: state.cacheHits,
      cacheMisses: state.cacheMisses,
      cacheHitRatio,
      staleFallbacks: state.staleFallbacks,
      refreshFailures: state.refreshFailures,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: state.lastFailureAt,
      lastFailureReason: state.lastFailureReason,
      lastLatencyMs: state.lastLatencyMs,
      avgLatencyMs: state.avgLatencyMs,
    },
  };
}
