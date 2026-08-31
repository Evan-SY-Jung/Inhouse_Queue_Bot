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

  it("formats every rank tier in Korean", () => {
    const labels = [
      ["IRON", "아이언"],
      ["BRONZE", "브론즈"],
      ["SILVER", "실버"],
      ["GOLD", "골드"],
      ["PLATINUM", "플래티넘"],
      ["EMERALD", "에메랄드"],
      ["DIAMOND", "다이아몬드"],
      ["MASTER", "마스터"],
      ["GRANDMASTER", "그랜드마스터"],
      ["CHALLENGER", "챌린저"],
    ];

    for (const [tier, label] of labels) {
      const usesLeaguePointsOnly = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier);
      expect(formatRankLabel(ranked(tier, 1, tier, usesLeaguePointsOnly ? null : "IV", 72))).toBe(
        `${label}${usesLeaguePointsOnly ? "" : " IV"} 72LP`,
      );
    }
    expect(formatRankLabel({ status: "UNRANKED" })).toBe("언랭크");
  });
});
