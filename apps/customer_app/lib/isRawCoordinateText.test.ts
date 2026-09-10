import { isRawCoordinateText, filterCoordinateAddressParts } from "./isRawCoordinateText";

describe("isRawCoordinateText", () => {
  it("detects lat,lng strings", () => {
    expect(isRawCoordinateText("29.3701168, 76.9637708")).toBe(true);
    expect(isRawCoordinateText("29.3701,76.9638")).toBe(true);
    expect(isRawCoordinateText("  -28.5, 77.1  ")).toBe(true);
  });

  it("rejects human place names", () => {
    expect(isRawCoordinateText("Gali Number 2, Panipat")).toBe(false);
    expect(isRawCoordinateText("Current location")).toBe(false);
    expect(isRawCoordinateText("")).toBe(false);
    expect(isRawCoordinateText(null)).toBe(false);
  });

  it("filters coordinate parts from address lists", () => {
    expect(
      filterCoordinateAddressParts(["29.37, 76.96", "Panipat", "Haryana"])
    ).toEqual(["Panipat", "Haryana"]);
  });
});
