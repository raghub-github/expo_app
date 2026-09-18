import test from "node:test";
import assert from "node:assert/strict";
import {
  isBogusAttachmentProxyKey,
  normalizeR2ObjectKey,
  r2LookupKeyVariants,
  r2OnboardingSearchPrefixes,
  r2ObjectFileName,
} from "./r2-proxy-url";
import { resolveAttachmentProxyUrl } from "./attachments/resolve-attachment-proxy-url";

test("r2LookupKeyVariants tries documents and legacy fssai folders", () => {
  const key =
    "docs/merchants/91/stores/GMMC102/onboarding/documents/fssai_123.pdf";
  const variants = r2LookupKeyVariants(key);
  assert.ok(variants.includes(key));
  assert.ok(variants.includes("merchants/91/stores/GMMC102/onboarding/documents/fssai_123.pdf"));
  assert.ok(variants.includes("docs/merchants/91/stores/GMMC102/onboarding/fssai/fssai_123.pdf"));
  assert.ok(variants.includes("docs/merchants/91/draft/onboarding/documents/fssai_123.pdf"));
  assert.ok(variants.includes("docs/merchants/91/draft/onboarding/fssai/fssai_123.pdf"));
});

test("r2OnboardingSearchPrefixes includes draft documents folder", () => {
  const prefixes = r2OnboardingSearchPrefixes(
    "/api/attachments/proxy?key=docs%2Fmerchants%2F91%2Fstores%2FGMMC102%2Fonboarding%2Fdocuments%2Ffssai_123.pdf"
  );
  assert.ok(prefixes.includes("docs/merchants/91/stores/GMMC102/onboarding/documents"));
  assert.ok(prefixes.includes("docs/merchants/91/draft/onboarding/documents"));
  assert.ok(prefixes.includes("docs/merchants/91/draft/onboarding/fssai"));
});

test("r2ObjectFileName unwraps proxy query keys", () => {
  assert.equal(
    r2ObjectFileName("/api/attachments/proxy?key=docs%2Fmerchants%2F91%2Fstores%2FGMMC102%2Fonboarding%2Fdocuments%2Ffssai_123.pdf"),
    "fssai_123.pdf"
  );
});

test("normalizeR2ObjectKey never treats attachments/proxy path as an object key", () => {
  assert.equal(normalizeR2ObjectKey("attachments/proxy"), "");
  assert.equal(normalizeR2ObjectKey("/api/attachments/proxy"), "");
  assert.equal(
    normalizeR2ObjectKey("https://dash.example/api/attachments/proxy?key=riders%2F1%2Fdocuments%2Fpan%2Flatest.jpg"),
    "riders/1/documents/pan/latest.jpg"
  );
  assert.equal(
    normalizeR2ObjectKey("attachments/proxy?key=riders/1/documents/pan/latest.jpg"),
    "riders/1/documents/pan/latest.jpg"
  );
  assert.ok(isBogusAttachmentProxyKey("attachments/proxy"));
});

test("resolveAttachmentProxyUrl rejects mangled proxy keys", () => {
  assert.equal(resolveAttachmentProxyUrl("attachments/proxy"), "");
  assert.equal(resolveAttachmentProxyUrl("/api/attachments/proxy"), "");
  assert.equal(
    resolveAttachmentProxyUrl("/api/attachments/proxy?key=attachments%2Fproxy"),
    ""
  );
  assert.equal(
    resolveAttachmentProxyUrl("/api/attachments/proxy?key=riders%2F1019%2Fdocuments%2Fpan%2Flatest.jpg"),
    "/api/attachments/proxy?key=riders%2F1019%2Fdocuments%2Fpan%2Flatest.jpg"
  );
});
