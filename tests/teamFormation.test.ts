import { describe, expect, it } from "vitest";
import type { QueueMember } from "../src/domain/models.js";
import { createTeamGames } from "../src/services/teamFormation.js";

function members(count: number): QueueMember[] {
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    recruitmentId: 1,
    userId: `member-${index + 1}`,
    displayName: `Member ${index + 1}`,
    riotName: `Riot ${index + 1}`,
    riotTag: `TAG${index + 1}`,
    joinedAt: index + 1,
  }));
}

describe("team formation", () => {
  it("requires a complete 10-player game", () => {
    expect(createTeamGames(members(9), 10, 20, () => 0.5)).toEqual([]);
  });

  it("creates one 5v5 game from 13 members and excludes the latest three", () => {
    const games = createTeamGames(members(13), 10, 20, () => 0.5);
    const assigned = [...games[0]!.blue, ...games[0]!.red];

    expect(games).toHaveLength(1);
    expect(games[0]?.blue).toHaveLength(5);
    expect(games[0]?.red).toHaveLength(5);
    expect(new Set(assigned.map((member) => member.userId))).toEqual(
      new Set(members(10).map((member) => member.userId)),
    );
  });

  it("creates two games from the first 20 members even when 40 are queued", () => {
    const games = createTeamGames(members(40), 10, 20, () => 0.25);
    const assigned = games.flatMap((game) => [...game.blue, ...game.red]);

    expect(games).toHaveLength(2);
    expect(assigned).toHaveLength(20);
    expect(new Set(assigned.map((member) => member.userId))).toEqual(
      new Set(members(20).map((member) => member.userId)),
    );
  });
});
