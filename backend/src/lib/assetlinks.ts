/**
 * Android Digital Asset Links + iOS Universal Links (AASA).
 *
 * Served at:
 *   https://gatimitra.com/.well-known/assetlinks.json
 *   https://gatimitra.com/.well-known/apple-app-site-association
 *
 * The Customer App intent filter must contain ONLY https hosts when
 * autoVerify is true. Mixing gatimitra:// custom-scheme hosts in the same
 * filter makes Android fail domain verification, so taps open Chrome.
 */

import { getEnv } from "../config/env.js";

const DEFAULT_PACKAGE = "com.gatimitra.customer";
const DEFAULT_RIDER_PACKAGE = "com.gatimitra.rider";
const DEFAULT_IOS_BUNDLE = "com.gatimitra.customer";

function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 64) return null;
  return (hex.match(/.{2}/g) ?? []).join(":");
}

function parseFingerprints(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((f) => normalizeFingerprint(f))
    .filter((f): f is string => Boolean(f));
}

export function getAppLinkFingerprints(): string[] {
  return parseFingerprints(getEnv().ANDROID_APP_LINK_SHA256);
}

export function getRiderAppLinkFingerprints(): string[] {
  return parseFingerprints(getEnv().ANDROID_RIDER_APP_LINK_SHA256);
}

export function buildAssetLinksJson(): unknown[] | null {
  const fingerprints = getAppLinkFingerprints();
  const riderFingerprints = getRiderAppLinkFingerprints();
  if (fingerprints.length === 0 && riderFingerprints.length === 0) return null;

  const env = getEnv();
  const statements: unknown[] = [];

  if (fingerprints.length > 0) {
    statements.push({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_APP_PACKAGE?.trim() || DEFAULT_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    });
  }

  if (riderFingerprints.length > 0) {
    statements.push({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.ANDROID_RIDER_APP_PACKAGE?.trim() || DEFAULT_RIDER_PACKAGE,
        sha256_cert_fingerprints: riderFingerprints,
      },
    });
  }

  return statements;
}

/** Apple App Site Association. Returns null when APPLE_TEAM_ID is unset. */
export function buildAppleAppSiteAssociation(): Record<string, unknown> | null {
  const teamId = getEnv().APPLE_TEAM_ID?.trim();
  if (!teamId) return null;
  const bundle = getEnv().IOS_APP_BUNDLE_ID?.trim() || DEFAULT_IOS_BUNDLE;
  const appID = `${teamId}.${bundle}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: ["/address/share/*", "/addr/*", "/ref/*", "/invite/*"],
        },
      ],
    },
  };
}
