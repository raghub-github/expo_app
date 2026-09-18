import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNotificationSoundOptions,
  resolveSelectedSoundSlot,
} from "./notificationSoundOptions";

test("buildNotificationSoundOptions only lists admin-filled slots", () => {
  const opts = buildNotificationSoundOptions(
    [null, "https://cdn.example/sound2.wav", "https://cdn.example/sound3.wav"],
    "RESTAURANT"
  );
  assert.equal(opts.length, 2);
  assert.equal(opts[0]!.slot, 1);
  assert.equal(opts[0]!.label, "Restaurant alert sound 2");
  assert.equal(opts[1]!.slot, 2);
  assert.equal(resolveSelectedSoundSlot(opts, 0), 1);
  assert.equal(resolveSelectedSoundSlot(opts, 2), 2);
});
