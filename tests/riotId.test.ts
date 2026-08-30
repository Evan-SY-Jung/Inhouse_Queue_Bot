import { describe, expect, it } from "vitest";
import { parseRiotId } from "../src/services/riotId.js";

describe("Riot ID", () => {
  it("normalizes a leading hash from the tag", () => {
    expect(parseRiotId(" Evan ", " #NA1 ")).toEqual({
      name: "Evan",
      tag: "NA1",
    });
  });

  it("rejects missing or malformed values", () => {
    expect(() => parseRiotId("", "NA1")).toThrow(/닉네임/);
    expect(() => parseRiotId("Evan", "#")).toThrow(/태그/);
    expect(() => parseRiotId("Evan", "NA#1")).toThrow(/태그/);
  });
});
