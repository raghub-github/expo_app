import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DbTimeoutError,
  isDbTimeoutError,
  withQueryDeadline,
} from "@/lib/db/deadline";

const never = () => new Promise<never>(() => {});
const after = <T,>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("withQueryDeadline", () => {
  it("returns the value when the query finishes in time", async () => {
    assert.equal(await withQueryDeadline(() => after(10, "ok"), "fast", 500), "ok");
  });

  it("rejects a query that never resolves, instead of hanging forever", async () => {
    // This is the whole point: a query waiting on an exhausted pool used to
    // wait for nginx's 120s proxy_read_timeout and return an HTML 504.
    const t = Date.now();
    await assert.rejects(
      () => withQueryDeadline(never, "wedged", 60),
      (e: unknown) => isDbTimeoutError(e)
    );
    assert.ok(Date.now() - t < 1_000, "must fail fast, not wait for the caller's timeout");
  });

  it("names the label and the budget in the error", async () => {
    await assert.rejects(
      () => withQueryDeadline(never, "sa-by-email", 20),
      (e: unknown) => e instanceof DbTimeoutError && /sa-by-email/.test((e as Error).message)
    );
  });

  it("propagates a real query error unchanged, not as a timeout", async () => {
    const boom = Object.assign(new Error("syntax error"), { code: "42601" });
    await assert.rejects(
      () => withQueryDeadline(() => Promise.reject(boom), "bad-sql", 500),
      (e: unknown) => e === boom && !isDbTimeoutError(e)
    );
  });

  it("cancels the pending query so the pool slot is handed back", async () => {
    let cancelled = false;
    const run = () => {
      const p = never() as Promise<never> & { cancel?: () => void };
      p.cancel = () => {
        cancelled = true;
      };
      return p;
    };
    await assert.rejects(() => withQueryDeadline(run, "cancels", 30));
    assert.equal(cancelled, true);
  });

  it("survives a query object with no cancel()", async () => {
    await assert.rejects(
      () => withQueryDeadline(never, "no-cancel", 30),
      (e: unknown) => isDbTimeoutError(e)
    );
  });

  it("survives a cancel() that itself throws", async () => {
    const run = () => {
      const p = never() as Promise<never> & { cancel?: () => void };
      p.cancel = () => {
        throw new Error("cancel exploded");
      };
      return p;
    };
    await assert.rejects(
      () => withQueryDeadline(run, "bad-cancel", 30),
      (e: unknown) => isDbTimeoutError(e)
    );
  });

  it("does not leave an unhandled rejection when the loser rejects late", async () => {
    // Promise.race leaves the losing promise unobserved; an unhandled
    // rejection here can take the whole Next.js server down.
    let sawUnhandled: unknown = null;
    const onUnhandled = (reason: unknown) => {
      sawUnhandled = reason;
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const run = () =>
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late")), 40));
      await assert.rejects(() => withQueryDeadline(run, "late-loser", 10));
      await after(150, null);
      assert.equal(sawUnhandled, null, "the losing rejection must be swallowed");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("treats a non-positive or non-finite budget as no deadline", async () => {
    // A misconfigured COREDASH_DB_TIMEOUT_MS must not fail every query instantly.
    assert.equal(await withQueryDeadline(() => after(20, "ok"), "zero", 0), "ok");
    assert.equal(await withQueryDeadline(() => after(20, "ok"), "neg", -5), "ok");
    assert.equal(await withQueryDeadline(() => after(20, "ok"), "nan", Number.NaN), "ok");
  });

  it("clears its timer so a fast query does not hold the event loop open", async () => {
    const before = process.getActiveResourcesInfo?.().length ?? 0;
    await withQueryDeadline(() => after(5, "ok"), "timer", 10_000);
    const afterCount = process.getActiveResourcesInfo?.().length ?? 0;
    assert.ok(afterCount <= before, "the deadline timer must be cleared on success");
  });
});

describe("isDbTimeoutError", () => {
  it("recognises the error by code as well as by instance", () => {
    assert.equal(isDbTimeoutError(new DbTimeoutError("x", 1)), true);
    assert.equal(isDbTimeoutError({ code: "COREDASH_DB_TIMEOUT" }), true);
  });

  it("does not claim unrelated errors", () => {
    assert.equal(isDbTimeoutError(new Error("nope")), false);
    assert.equal(isDbTimeoutError({ code: "57014" }), false);
    assert.equal(isDbTimeoutError(null), false);
    assert.equal(isDbTimeoutError(undefined), false);
    assert.equal(isDbTimeoutError("COREDASH_DB_TIMEOUT"), false);
  });
});
