import { processDueDispatchWaves } from "./order-dispatch.service.js";

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/** Polls for dispatch wave expansions and re-runs the assignment engine with live GPS. */
export async function runOrderDispatchWaveTick(log: Logger): Promise<number> {
  const processed = await processDueDispatchWaves(30);
  if (processed > 0) {
    log.info({ processed }, "order_dispatch_wave_tick");
  }
  return processed;
}
