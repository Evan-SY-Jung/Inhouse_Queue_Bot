import { describe, expect, it } from "vitest";
import { comparePlayersByRank, formatRankLabel } from "../web/rankSort.js";

function ranked(name, position, tier, division, leaguePoints) {
  return { name, position, status: "RANKED", tier, division, leaguePoints };
}

describe("team builder rank sorting", () => {
  const players = [
    ranked("Gold IV", 1, "GOLD", "IV", 90),
    ranked("Master 100", 2, "MASTER", null, 100),
    ranked("Gold I", 3, "GOLD", "I", 10),
    ranked("Challenger", 4, "CHALLENGER", null, 20),
    ranked("Master 500", 5, "MASTER", null, 500),
    { name: "Unranked", position: 6, status: "UNRANKED", tier: null },
  ];

  it("sorts IV below I and uses LP within Master and above", () => {
    const high = [...players].sort((left, right) => comparePlayersByRank(left, right, "high"));
    const low = [...players].sort((left, right) => comparePlayersByRank(left, right, "low"));

    expect(high.map((player) => player.name)).toEqual([
      "Challenger",
      "Master 500",
      "Master 100",
      "Gold I",
      "Gold IV",
      "Unranked",
    ]);
    expect(low.map((player) => player.name)).toEqual([
      "Gold IV",
      "Gold I",
      "Master 100",
      "Master 500",
      "Challenger",
      "Unranked",
    ]);
  });

  it("formats every rank tier as a compact code", () => {
    const labels = [
      ["IRON", "I3"],
      ["BRONZE", "B3"],
      ["SILVER", "S3"],
      ["GOLD", "G3"],
      ["PLATINUM", "P3"],
      ["EMERALD", "E3"],
      ["DIAMOND", "D3"],
      ["MASTER", "M72"],
      ["GRANDMASTER", "GM72"],
      ["CHALLENGER", "C72"],
    ];

    for (const [tier, expected] of labels) {
      const usesLeaguePointsOnly = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier);
      expect(
        formatRankLabel(ranked(tier, 1, tier, usesLeaguePointsOnly ? null : "III", 72)),
      ).toBe(expected);
    }
    expect(formatRankLabel(ranked("Bronze", 1, "BRONZE", "III", 20))).toBe("B3");
    expect(formatRankLabel(ranked("Diamond", 1, "DIAMOND", "I", 99))).toBe("D1");
    expect(formatRankLabel(ranked("Master", 1, "MASTER", null, 327))).toBe("M327");
    expect(formatRankLabel({ status: "UNRANKED" })).toBe("언랭");
  });
});
