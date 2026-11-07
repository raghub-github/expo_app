import { test } from "node:test";
import assert from "node:assert/strict";
import { runHedged, type HedgedProvider } from "./hedgedRequest";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function provider(
  name: string,
  hedgeAfterMs: number,
  answer: () => Promise<string | null>,
  log: string[] = [],
  timeoutMs = 2_000
): HedgedProvider<string> {
  return {
    name,
    hedgeAfterMs,
    timeoutMs,
    run: (signal) => {
      log.push(`start:${name}`);
      signal.addEventListener("abort", () => log.push(`abort:${name}`));
      return Promise.race([
        answer(),
        new Promise<null>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        ),
      ]);
    },
  };
}

test("a healthy preferred provider wins and the others are never started (no extra billing)", async () => {
  const log: string[] = [];
  const result = await runHedged([
    provider("a", 0, async () => "A", log),
    provider("b", 50, async () => "B", log),
  ]);
  assert.deepEqual(result, { value: "A", provider: "a" });
  await wait(80);
  assert.ok(!log.includes("start:b"));
});

test("a stalled provider is hedged after the delay, and the winner aborts it", async () => {
  const log: string[] = [];
  const result = await runHedged([
    provider("a", 0, () => new Promise(() => {}), log),
    provider("b", 20, async () => "B", log),
  ]);
  assert.deepEqual(result, { value: "B", provider: "b" });
  assert.ok(log.includes("abort:a"));
});

test("the slow preferred provider still wins if it answers before the hedge lands", async () => {
  const result = await runHedged([
    provider("a", 0, async () => {
      await wait(30);
      return "A";
    }),
    provider("b", 20, async () => {
      await wait(200);
      return "B";
    }),
  ]);
  assert.equal(result?.provider, "a");
});

test("an empty answer moves to the next provider at once, not after the hedge delay", async () => {
  const t0 = Date.now();
  const result = await runHedged([
    provider("a", 0, async () => null),
    provider("b", 5_000, async () => "B"),
  ]);
  assert.equal(result?.value, "B");
  assert.ok(Date.now() - t0 < 500);
});

test("a thrown provider moves to the next at once", async () => {
  const result = await runHedged([
    provider("a", 0, async () => {
      throw new Error("500");
    }),
    provider("b", 5_000, async () => "B"),
  ]);
  assert.equal(result?.value, "B");
});

test("a provider past its own timeout counts as failed", async () => {
  const t0 = Date.now();
  const result = await runHedged([
    provider("a", 0, () => new Promise(() => {}), [], 30),
    provider("b", 5_000, async () => "B"),
  ]);
  assert.equal(result?.value, "B");
  assert.ok(Date.now() - t0 < 500);
});

test("a provider that ignores its abort still times out (a hung native call cannot hang the chain)", async () => {
  const t0 = Date.now();
  const result = await runHedged([
    { name: "deaf", hedgeAfterMs: 0, timeoutMs: 30, run: () => new Promise(() => {}) },
  ]);
  assert.equal(result, null);
  assert.ok(Date.now() - t0 < 500);
});

test("all failing resolves null: the chain never rejects or hangs", async () => {
  const result = await runHedged([
    provider("a", 0, async () => null),
    provider("b", 10, () => new Promise(() => {}), [], 30),
    provider("c", 20, async () => {
      throw new Error("x");
    }),
  ]);
  assert.equal(result, null);
});

test("the outer signal cancels everything", async () => {
  const log: string[] = [];
  const outer = new AbortController();
  const pending = runHedged([provider("a", 0, () => new Promise(() => {}), log)], outer.signal);
  outer.abort();
  assert.equal(await pending, null);
  assert.ok(log.includes("abort:a"));
});

test("no providers resolves null", async () => {
  assert.equal(await runHedged([]), null);
});
