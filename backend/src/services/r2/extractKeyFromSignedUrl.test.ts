import test from "node:test";
import assert from "node:assert/strict";
import { extractKeyFromSignedUrl } from "./r2Service.js";

test("extractKeyFromSignedUrl reads ?key= from absolute proxy URLs", () => {
  assert.equal(
    extractKeyFromSignedUrl(
      "http://10.15.120.181:3000/api/attachments/proxy?key=riders%2F1019%2Fdocuments%2Fpan%2Flatest.jpg"
    ),
    "riders/1019/documents/pan/latest.jpg"
  );
  assert.equal(
    extractKeyFromSignedUrl(
      "https://api.example/v1/attachments/proxy?key=riders/9/documents/selfie/latest.jpg"
    ),
    "riders/9/documents/selfie/latest.jpg"
  );
});

test("extractKeyFromSignedUrl reads ?key= from relative proxy paths", () => {
  assert.equal(
    extractKeyFromSignedUrl("/v1/attachments/proxy?key=riders%2F1%2Fdocuments%2Fpan%2Flatest.jpg"),
    "riders/1/documents/pan/latest.jpg"
  );
});

test("extractKeyFromSignedUrl does not invent attachments/proxy as the object key", () => {
  assert.equal(extractKeyFromSignedUrl("https://dash.example/api/attachments/proxy"), null);
  assert.equal(extractKeyFromSignedUrl("/api/attachments/proxy"), null);
});
