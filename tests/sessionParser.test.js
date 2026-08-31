import { describe, expect, it } from "vitest";
import { parseTeamBuilderSession } from "../web/sessionParser.js";

const sharedPlayer = {
  riotName: "Hide on study",
  riotTag: "클로버",
  status: "RANKED",
  queue: "SOLO",
  tier: "BRONZE",
  division: "III",
  leaguePoints: 20,
};

describe("team builder web session compatibility", () => {
  it("parses the compact Riot-only session", () => {
    const session = parseTeamBuilderSession([
      3,
      77,
      "R",
      1_800_000_000,
      1_800_003_600,
      5,
      0,
      [["Hide on study", "클로버", "R", "S", "BRONZE", "III", 20]],
    ]);

    expect(session.players[0]).toEqual(sharedPlayer);
    expect(session.players[0]).not.toHaveProperty("userId");
    expect(session.players[0]).not.toHaveProperty("avatarRef");
  });

  it("continues to parse avatar session links", () => {
    const session = parseTeamBuilderSession([
      2,
      77,
      "R",
      "1542873758770135061",
      1_800_000_000,
      1_800_003_600,
      5,
      0,
      [
        [
          "♣ Hide on study 세준 05",
          "Hide on study",
          "클로버",
          "R",
          "S",
          "BRONZE",
          "III",
          20,
          "1000000000000000001",
          "d0",
        ],
      ],
    ]);

    expect(session.players[0]).toEqual(sharedPlayer);
  });

  it("continues to parse the original session links", () => {
    const session = parseTeamBuilderSession([
      1,
      77,
      "R",
      1_800_000_000,
      1_800_003_600,
      5,
      0,
      [["Discord Name", "Hide on study", "클로버", "R", "S", "BRONZE", "III", 20]],
    ]);

    expect(session.players[0]).toEqual(sharedPlayer);
  });
});
