import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRiderWaitingDecision } from "./rider-waiting-decision.ts";

const base = {
  promptAfterMinutes: 10,
  riderDecided: false,
  promptsSent: 0,
  minutesSinceLastPrompt: null as number | null,
  minutesSinceFirstPrompt: null as number | null,
};

test("below threshold → do nothing", () => {
  const r = resolveRiderWaitingDecision({ ...base, waitMinutes: 5 });
  assert.equal(r.action, "NONE");
});

test("crosses threshold → first prompt", () => {
  const r = resolveRiderWaitingDecision({ ...base, waitMinutes: 10 });
  assert.equal(r.action, "PROMPT");
  assert.equal(r.reason, "first_prompt");
});

test("rider already decided → never prompt again", () => {
  const r = resolveRiderWaitingDecision({
    ...base,
    waitMinutes: 25,
    riderDecided: true,
    promptsSent: 2,
    minutesSinceLastPrompt: 20,
    minutesSinceFirstPrompt: 20,
  });
  assert.equal(r.action, "NONE");
  assert.equal(r.reason, "already_decided");
});

test("re-prompt every 10 min while unanswered", () => {
  // 9 min since last prompt → not yet.
  const soon = resolveRiderWaitingDecision({
    ...base, waitMinutes: 20, promptsSent: 1, minutesSinceLastPrompt: 9, minutesSinceFirstPrompt: 9,
  });
  assert.equal(soon.action, "NONE");
  // 10 min since last prompt → re-ask.
  const due = resolveRiderWaitingDecision({
    ...base, waitMinutes: 20, promptsSent: 1, minutesSinceLastPrompt: 10, minutesSinceFirstPrompt: 10,
  });
  assert.equal(due.action, "PROMPT");
  assert.equal(due.reason, "reprompt");
});

test("no auto-cancel — after the 30-min window we STOP prompting, never CANCEL", () => {
  const r = resolveRiderWaitingDecision({
    ...base, waitMinutes: 45, promptsSent: 3, minutesSinceLastPrompt: 10, minutesSinceFirstPrompt: 30,
  });
  assert.equal(r.action, "STOP");
  assert.equal(r.reason, "window_elapsed");
});

test("full sequence: prompts at ~0/10/20/30 then STOP (≈4 prompts over 30 min)", () => {
  const at = (sinceFirst: number, promptsSent: number, sinceLast: number) =>
    resolveRiderWaitingDecision({
      ...base, waitMinutes: 10 + sinceFirst, promptsSent, minutesSinceLastPrompt: sinceLast, minutesSinceFirstPrompt: sinceFirst,
    }).action;
  assert.equal(at(0, 0, 0), "PROMPT");   // first (threshold)
  assert.equal(at(10, 1, 10), "PROMPT"); // +10
  assert.equal(at(20, 2, 10), "PROMPT"); // +20
  assert.equal(at(30, 3, 10), "STOP");   // +30 → stop, no cancel
  assert.equal(at(45, 4, 15), "STOP");   // still stopped
});

test("action is never CANCEL — a non-responding rider is only re-prompted or left alone", () => {
  for (let m = 10; m <= 90; m += 5) {
    const a = resolveRiderWaitingDecision({
      ...base, waitMinutes: m, promptsSent: Math.min(4, Math.floor((m - 10) / 10)),
      minutesSinceLastPrompt: 10, minutesSinceFirstPrompt: m - 10,
    }).action;
    assert.ok(a === "NONE" || a === "PROMPT" || a === "STOP", `unexpected action ${a} at ${m}min`);
  }
});
