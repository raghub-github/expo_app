import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isLinkPreviewCrawler,
  buildAddressSharePlayStoreUrl,
  CUSTOMER_PLAY_STORE_URL,
} from "./address-share-page.js";

describe("address share landing", () => {
  it("treats WhatsApp/Facebook as crawlers so OG preview HTML is served", () => {
    assert.equal(isLinkPreviewCrawler("WhatsApp/2.24.0"), true);
    assert.equal(isLinkPreviewCrawler("facebookexternalhit/1.1"), true);
  });

  it("does not treat Chrome as a crawler so missing-app hits go to Play Store", () => {
    assert.equal(
      isLinkPreviewCrawler(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36"
      ),
      false
    );
  });

  it("uses the official customer Play Store listing", () => {
    const url = buildAddressSharePlayStoreUrl("abc123token");
    assert.ok(url.startsWith(CUSTOMER_PLAY_STORE_URL));
    assert.ok(url.includes("referrer="));
    assert.equal(
      CUSTOMER_PLAY_STORE_URL,
      "https://play.google.com/store/apps/details?id=com.gatimitra.customer"
    );
  });
});
