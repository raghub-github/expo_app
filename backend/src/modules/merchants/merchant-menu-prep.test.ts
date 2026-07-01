import { describe, expect, it } from "vitest";
import {
  averagePrepMinutesFromMenuItemRows,
  averagePrepMinutesFromValues,
  resolveStorePrepMinutesForEta,
} from "./merchant-menu-prep.js";

describe("merchant-menu-prep", () => {
  it("averages positive prep values", () => {
    expect(averagePrepMinutesFromValues([10, 20, 30])).toBe(20);
  });

  it("derives average from menu item rows", () => {
    expect(
      averagePrepMinutesFromMenuItemRows([
        { preparation_time_minutes: 15 },
        { preparation_time_minutes: 25 },
        { preparation_time_minutes: null },
      ])
    ).toBe(20);
  });

  it("prefers menu average over store default", () => {
    expect(resolveStorePrepMinutesForEta(22, 30)).toBe(22);
    expect(resolveStorePrepMinutesForEta(null, 30)).toBe(30);
  });

  it("adds preparation buffer to base prep for customer ETA", () => {
    expect(resolveStorePrepMinutesForEta(20, 30, 10)).toBe(30);
    expect(resolveStorePrepMinutesForEta(null, 20, 10)).toBe(30);
    expect(resolveStorePrepMinutesForEta(20, 30, 0)).toBe(20);
    expect(resolveStorePrepMinutesForEta(20, 30, null)).toBe(20);
  });
});
