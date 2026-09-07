import test from "node:test";
import assert from "node:assert/strict";
import {
  r2LookupKeyVariants,
  r2OnboardingSearchPrefixes,
  r2ObjectFileName,
} from "./r2-proxy-url";

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
