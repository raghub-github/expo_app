/**
 * Android App Links — Digital Asset Links (assetlinks.json).
 *
 * Served at https://link.gatimitra.com/.well-known/assetlinks.json so Android
 * can auto-verify the `link.gatimitra.com` domain declared by the Customer
 * App's intent filter (autoVerify: true). When verification succeeds Android
 * opens the app directly for https://link.gatimitra.com/addr/... links — no
 * disambiguation chooser, no browser.
 *
 * The SHA-256 signing-certificate fingerprint(s) come from env so they can be
 * rotated without a code change. With EAS + Google Play App Signing there are
 * usually TWO fingerprints to list:
 *   1. the Play "App signing key certificate" (Play Console → App integrity)
 *   2. the "Upload key certificate" (also shown there / `eas credentials`)
 * List BOTH (comma-separated) so internal APKs and Play-signed AABs both verify.
 *
 *   ANDROID_APP_LINK_SHA256="AA:BB:...,11:22:..."
 *   ANDROID_APP_PACKAGE="com.gatimitra.customer"   (optional; this is the default)
 */

import { getEnv } from "../config/env.js";

const DEFAULT_PACKAGE = "com.gatimitra.customer";

/** Normalise a fingerprint to the colon-separated uppercase hex Google expects. */
function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 64) return null; // SHA-256 = 32 bytes = 64 hex chars
  return (hex.match(/.{2}/g) ?? []).join(":");
}

export function getAppLinkFingerprints(): string[] {
  const env = getEnv();
  const raw = env.ANDROID_APP_LINK_SHA256 ?? "";
  return raw
    .split(",")
    .map((f) => normalizeFingerprint(f))
    .filter((f): f is string => Boolean(f));
}

/**
 * Build the assetlinks.json payload. Returns `null` when no fingerprints are
 * configured, so the route can 503 rather than publish a broken (empty) file
 * that Android would cache as a verification failure.
 */
export function buildAssetLinksJson(): unknown[] | null {
  const fingerprints = getAppLinkFingerprints();
  if (fingerprints.length === 0) return null;

  const env = getEnv();
  const packageName = env.ANDROID_APP_PACKAGE?.trim() || DEFAULT_PACKAGE;

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
