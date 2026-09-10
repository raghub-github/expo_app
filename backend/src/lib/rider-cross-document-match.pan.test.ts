import { describe, expect, it } from "vitest";
import { panAadhaarNamesMatch } from "./rider-cross-document-match.js";

describe("panAadhaarNamesMatch", () => {
  it("accepts exact match ignoring case and spaces", () => {
    expect(panAadhaarNamesMatch("Rahul Kumar", "  RAHUL   KUMAR ")).toBe(true);
  });

  it("accepts same tokens in different order", () => {
    expect(panAadhaarNamesMatch("Kumar Rahul", "Rahul Kumar")).toBe(true);
  });

  it("rejects extra surname token", () => {
    expect(panAadhaarNamesMatch("Rahul Kumar Singh", "Rahul Kumar")).toBe(false);
  });

  it("rejects genuinely different names", () => {
    expect(panAadhaarNamesMatch("Amit Sharma", "Rahul Kumar")).toBe(false);
  });

  it("rejects empty names", () => {
    expect(panAadhaarNamesMatch("", "Rahul")).toBe(false);
    expect(panAadhaarNamesMatch("Rahul", null)).toBe(false);
  });
});
