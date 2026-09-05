import assert from "node:assert/strict";
import { test } from "node:test";
import { formatIstDateTimeParts } from "./format-ist-datetime";

test("converts UTC ISO to India 12-hour time", () => {
  const { date, time } = formatIstDateTimeParts("2026-09-05T10:48:27.000Z");
  assert.match(time.toLowerCase(), /4:18:27\s*pm/);
  assert.match(date.replace(/\s/g, ""), /5-9-2026|05-09-2026/);
});

test("treats legacy naive UTC wall-clock as UTC", () => {
  const { time } = formatIstDateTimeParts("2026-09-05 10:48:27");
  assert.match(time.toLowerCase(), /4:18:27\s*pm/);
});
