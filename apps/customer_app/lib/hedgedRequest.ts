/**
 * Hedged provider chain: start the preferred provider; if it has not answered within
 * its hedge delay (or has already failed), start the next one as well. The first usable
 * answer wins and every other in-flight request is aborted.
 *
 * Racing all providers from the start is fast but pays for each one on every call, and
 * lets a lower-quality provider beat the accurate one. A plain sequential chain keeps the
 * quality but makes a slow first provider everybody's problem. Hedging gets both: the
 * preferred provider wins whenever it is healthy, and a stall costs only the hedge delay.
 *
 * Dependency-free so the timing rules are unit-testable.
 */

export type HedgedProvider<T> = {
  name: string;
  /** Ms after the chain starts that this provider is started anyway, if none has won yet. */
  hedgeAfterMs: number;
  /** Per-attempt ceiling, after which this provider counts as failed. */
  timeoutMs: number;
  /** Resolve null when the provider has no usable answer. */
  run: (signal: AbortSignal) => Promise<T | null>;
};

export type HedgedResult<T> = { value: T; provider: string };

export function runHedged<T>(
  providers: ReadonlyArray<HedgedProvider<T>>,
  outerSignal?: AbortSignal
): Promise<HedgedResult<T> | null> {
  return new Promise((resolve) => {
    let settled = false;
    let nextIndex = 0;
    let running = 0;
    const controllers: AbortController[] = [];
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const finish = (result: HedgedResult<T> | null) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      controllers.forEach((c) => c.abort());
      outerSignal?.removeEventListener("abort", onOuterAbort);
      resolve(result);
    };
    const onOuterAbort = () => finish(null);

    const startNext = () => {
      if (settled || nextIndex >= providers.length) return;
      const provider = providers[nextIndex++]!;
      const controller = new AbortController();
      controllers.push(controller);
      running += 1;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      // The timer settles this attempt itself rather than relying on the abort: not every
      // provider honours one (the native geocoder ignores it), and a hung attempt must
      // still count as failed so the chain can finish.
      const expired = new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, provider.timeoutMs);
      });
      timers.push(timeout!);

      void Promise.race([provider.run(controller.signal), expired])
        .then(
          (value) => (value == null ? null : value),
          () => null
        )
        .then((value) => {
          clearTimeout(timeout);
          running -= 1;
          if (settled) return;
          if (value != null) {
            finish({ value, provider: provider.name });
            return;
          }
          // Failed or empty: do not wait out the hedge delay for the next provider.
          if (nextIndex < providers.length) startNext();
          else if (running === 0) finish(null);
        });

      const next = providers[nextIndex];
      if (next) {
        timers.push(
          setTimeout(() => {
            if (providers[nextIndex] === next) startNext();
          }, Math.max(0, next.hedgeAfterMs - provider.hedgeAfterMs))
        );
      }
    };

    if (outerSignal?.aborted) {
      finish(null);
      return;
    }
    outerSignal?.addEventListener("abort", onOuterAbort);
    if (providers.length === 0) {
      finish(null);
      return;
    }
    startNext();
  });
}
