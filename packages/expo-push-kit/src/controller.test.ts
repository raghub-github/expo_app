import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure helpers mirrored from permission/controller for unit coverage without
 * loading React Native / Expo modules in node:test.
 */

type PushOsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

function mapOsStatus(
  status: string,
  canAskAgain: boolean | undefined
): PushOsPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  if (status === "denied") {
    if (canAskAgain === false) return "blocked";
    return "denied";
  }
  return "undetermined";
}

function roleTopic(role: "customer" | "rider" | "merchant"): string {
  return `app_${role}`;
}

function storeTopic(storeId: number): string {
  return `merchant_store_${storeId}`;
}

function desiredTopics(input: {
  role: "customer" | "rider" | "merchant";
  nativeTokenType: "fcm" | "apns" | null;
  storeId?: number | null;
}): string[] {
  if (input.nativeTokenType !== "fcm") return [];
  const topics = [roleTopic(input.role)];
  if (input.role === "merchant" && input.storeId != null && input.storeId > 0) {
    topics.push(storeTopic(input.storeId));
  }
  return topics;
}

function topicDiff(current: string[], desired: string[]): { subscribe: string[]; unsubscribe: string[] } {
  const cur = new Set(current);
  const des = new Set(desired);
  return {
    subscribe: desired.filter((t) => !cur.has(t)),
    unsubscribe: current.filter((t) => !des.has(t)),
  };
}

function isExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

function syncKey(parts: {
  expo: string | null;
  native: string | null;
  role: string;
  storeId?: number | null;
  userPrefix: string;
}): string {
  return [parts.userPrefix, parts.role, parts.storeId ?? "", parts.expo ?? "", parts.native ?? ""].join("|");
}

describe("push permission status mapping", () => {
  it("maps granted", () => {
    assert.equal(mapOsStatus("granted", true), "granted");
  });
  it("maps undetermined", () => {
    assert.equal(mapOsStatus("undetermined", true), "undetermined");
  });
  it("maps denied when can ask again", () => {
    assert.equal(mapOsStatus("denied", true), "denied");
  });
  it("maps blocked when cannot ask again", () => {
    assert.equal(mapOsStatus("denied", false), "blocked");
  });
});

describe("topic reconciliation", () => {
  it("only topics FCM tokens", () => {
    assert.deepEqual(
      desiredTopics({ role: "customer", nativeTokenType: "apns" }),
      []
    );
    assert.deepEqual(
      desiredTopics({ role: "customer", nativeTokenType: "fcm" }),
      ["app_customer"]
    );
  });

  it("adds merchant store topic", () => {
    assert.deepEqual(
      desiredTopics({ role: "merchant", nativeTokenType: "fcm", storeId: 42 }),
      ["app_merchant", "merchant_store_42"]
    );
  });

  it("unsubscribes obsolete topics before subscribe", () => {
    const diff = topicDiff(
      ["app_merchant", "merchant_store_1"],
      ["app_merchant", "merchant_store_2"]
    );
    assert.deepEqual(diff.unsubscribe, ["merchant_store_1"]);
    assert.deepEqual(diff.subscribe, ["merchant_store_2"]);
  });

  it("rejects expo token strings for FCM topic APIs", () => {
    assert.equal(isExpoPushToken("ExponentPushToken[abc]"), true);
    assert.equal(isExpoPushToken("dG9rZW4="), false);
  });
});

describe("sync dedupe key", () => {
  it("changes when store changes", () => {
    const a = syncKey({
      userPrefix: "tok",
      role: "merchant",
      storeId: 1,
      expo: "e1",
      native: "n1",
    });
    const b = syncKey({
      userPrefix: "tok",
      role: "merchant",
      storeId: 2,
      expo: "e1",
      native: "n1",
    });
    assert.notEqual(a, b);
  });
});
