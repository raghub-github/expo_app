import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isExpoGoRuntime,
  shouldUseNativeMapbox,
  resolveMapRuntimeKind,
  resolveMapboxPublicTokenFromEnv,
} from "./map-runtime.js";

describe("map-runtime", () => {
  it("treats Expo Go as fallback-only (never native)", () => {
    assert.equal(isExpoGoRuntime("expo"), true);
    assert.equal(
      shouldUseNativeMapbox({ appOwnership: "expo", platformOs: "android" }),
      false
    );
    assert.deepEqual(
      resolveMapRuntimeKind({
        appOwnership: "expo",
        platformOs: "android",
        tokenPresent: true,
        nativeModulePresent: false,
      }),
      { kind: "expo_go_fallback", reason: "expo_go" }
    );
  });

  it("uses native Mapbox for development builds and production", () => {
    assert.equal(
      shouldUseNativeMapbox({ appOwnership: null, platformOs: "android" }),
      true
    );
    assert.equal(
      shouldUseNativeMapbox({ appOwnership: undefined, platformOs: "ios" }),
      true
    );
    assert.deepEqual(
      resolveMapRuntimeKind({
        appOwnership: null,
        platformOs: "android",
        tokenPresent: true,
        nativeModulePresent: true,
      }),
      { kind: "native_mapbox", reason: "ok" }
    );
  });

  it("does not use __DEV__ — missing token is unavailable even in native binary", () => {
    assert.deepEqual(
      resolveMapRuntimeKind({
        appOwnership: null,
        platformOs: "android",
        tokenPresent: false,
        nativeModulePresent: true,
      }),
      { kind: "unavailable", reason: "missing_token" }
    );
  });

  it("resolves token from CX ACCESS_TOKEN alias", () => {
    assert.equal(
      resolveMapboxPublicTokenFromEnv({
        EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.test_access",
      }),
      "pk.test_access"
    );
    assert.equal(
      resolveMapboxPublicTokenFromEnv(
        {},
        { mapboxAccessToken: "pk.from_extra" }
      ),
      "pk.from_extra"
    );
  });
});
