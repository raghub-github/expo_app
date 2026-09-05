import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDeliverySlideAction } from "./deliverySlideAction";

describe("resolveDeliverySlideAction", () => {
  it("opens camera when no proof exists", () => {
    assert.equal(resolveDeliverySlideAction(null), "camera");
    assert.equal(resolveDeliverySlideAction({}), "camera");
  });

  it("reopens OTP when the photo is already uploaded", () => {
    assert.equal(
      resolveDeliverySlideAction({
        localUri: "file:///proof.jpg",
        uploaded: { proxyUrl: "/v1/attachments/proxy?key=a", key: "a" },
      }),
      "reopen-otp"
    );
  });

  it("reopens OTP and retries upload when a local capture exists", () => {
    assert.equal(
      resolveDeliverySlideAction({ localUri: "file:///proof.jpg" }),
      "reopen-otp-and-upload"
    );
  });
});
