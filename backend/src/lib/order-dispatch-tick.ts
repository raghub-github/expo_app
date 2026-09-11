import { processDueDispatchWaves } from "./order-dispatch.service.js";
import { realertActiveDispatchOffers } from "./dispatch-offer-realert.js";
import { withSqlRetry } from "../db/client.js";

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

/** Polls for dispatch wave expansions and re-runs the assignment engine with live GPS. */
export async function runOrderDispatchWaveTick(log: Logger): Promise<number> {
  try {
    const processed = await withSqlRetry(() => processDueDispatchWaves(30));
    if (processed > 0) {
      log.info({ processed }, "order_dispatch_wave_tick");
    }

    // GAP 3b — one bounded re-alert of un-accepted offers before the wave expands. Never throws;
    // its own failure must not affect wave processing.
    try {
      const realert = await realertActiveDispatchOffers(30);
      if (realert.ridersRealerted > 0) {
        log.info(realert, "dispatch_offer_realert");
      }
    } catch (err) {
      log.error({ err }, "dispatch_offer_realert_failed");
    }

    return processed;
  } catch (err) {
    log.error({ err }, "order_dispatch_wave_tick");
    return 0;
  }
}
