import { describe, expect, it } from "vitest";
import type { QueueMember, Recruitment } from "../src/domain/models.js";
import type { RiotRankLookup } from "../src/services/riotApi.js";
import {
  decodeTeamBuilderSession,
  resolveQueueMemberRiotId,
  TeamBuilderService,
} from "../src/services/teamBuilder.js";

const recruitment: Pick<Recruitment, "id" | "gameType"> = {
  id: 77,
  gameType: "RIFT",
};

function members(count: number): QueueMember[] {
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    recruitmentId: recruitment.id,
    userId: (1_000_000_000_000_000_000n + BigInt(index + 1)).toString(),
    displayName: `정멤${index + 1}`,
    riotName: index === 1 ? "신입롤닉" : null,
    riotTag: index === 1 ? "NEW1" : null,
    joinedAt: index + 1,
  }));
}

const rankLookup: RiotRankLookup = {
  async lookupMany(riotIds) {
    return riotIds.map((riotId, index) => ({
      riotName: riotId.name,
      riotTag: riotId.tag,
      status: index === 2 ? "UNRANKED" : "RANKED",
      queue: index === 2 ? null : "SOLO",
      tier: index === 2 ? null : "GOLD",
      division: index === 2 ? null : "II",
      leaguePoints: index === 2 ? null : 50,
    }));
  },
};

describe("team builder session", () => {
  it("uses submitted IDs for guests and Discord names with the fixed tag for members", () => {
    expect(resolveQueueMemberRiotId(members(2)[0]!, "클로버")).toEqual({
      name: "정멤1",
      tag: "클로버",
    });
    expect(resolveQueueMemberRiotId(members(2)[1]!, "클로버")).toEqual({
      name: "신입롤닉",
      tag: "NEW1",
    });
    expect(
      resolveQueueMemberRiotId(
        { displayName: "DisplayName#NA1", riotName: null, riotTag: null },
        "클로버",
      ),
    ).toEqual({ name: "DisplayName", tag: "NA1" });
    expect(
      resolveQueueMemberRiotId(
        { displayName: "♣ Jindog 광진 00", riotName: null, riotTag: null },
        "클로버",
      ),
    ).toEqual({ name: "Jindog", tag: "클로버" });
    expect(
      resolveQueueMemberRiotId(
        { displayName: "◆ AdminCarry 민수 27", riotName: null, riotTag: null },
        "클로버",
      ),
    ).toEqual({ name: "AdminCarry", tag: "클로버" });
    expect(
      resolveQueueMemberRiotId(
        { displayName: "♣ Hide on study 세준 05", riotName: null, riotTag: null },
        "클로버",
      ),
    ).toEqual({ name: "Hide on study", tag: "클로버" });
    expect(
      resolveQueueMemberRiotId(
        { displayName: "♣ 둔 기 현겸 98", riotName: null, riotTag: null },
        "클로버",
      ),
    ).toEqual({ name: "둔 기", tag: "클로버" });
  });

  it("encodes partial games into an expiring URL fragment", async () => {
    const service = new TeamBuilderService(rankLookup, {
      baseUrl: "https://example.github.io/Inhouse_Queue_Bot/",
      fixedMemberTag: "클로버",
      callSize: 10,
      sessionTtlMs: 60 * 60 * 1_000,
      now: () => 1_800_000_000_000,
    });

    const selectedMembers = members(13);
    const result = await service.createLink(recruitment, selectedMembers);
    const url = new URL(result.url);
    const session = decodeTeamBuilderSession(url.hash.slice("#s=".length));

    expect(url.origin + url.pathname).toBe("https://example.github.io/Inhouse_Queue_Bot/");
    expect(url.searchParams.get("v")).toBe("6");
    expect(result).toMatchObject({
      selectedCount: 13,
      excludedCount: 0,
      rankedCount: 12,
      unrankedCount: 1,
      unavailableCount: 0,
    });
    expect(session).toMatchObject({
      version: 3,
      recruitmentId: 77,
      gameType: "RIFT",
      generatedAt: 1_800_000_000,
      expiresAt: 1_800_003_600,
      teamSize: 5,
      excludedCount: 0,
    });
    expect(session.players).toHaveLength(13);
    expect(session.players[0]).toMatchObject({
      riotName: "정멤1",
      riotTag: "클로버",
      tier: "GOLD",
    });
    expect(session.players[1]).toMatchObject({
      riotName: "신입롤닉",
      riotTag: "NEW1",
    });
    expect(session).not.toHaveProperty("guildId");
    expect(session.players[0]).not.toHaveProperty("displayName");
    expect(session.players[0]).not.toHaveProperty("userId");
    expect(session.players[0]).not.toHaveProperty("avatarRef");
    expect(result.url).not.toContain("secret");
  });

  it("creates a test board with a single participant", async () => {
    const service = new TeamBuilderService(rankLookup, {
      baseUrl: "https://example.github.io/Inhouse_Queue_Bot/",
      fixedMemberTag: "클로버",
      callSize: 10,
      sessionTtlMs: 300_000,
    });

    const result = await service.createLink(recruitment, members(1));
    const session = decodeTeamBuilderSession(new URL(result.url).hash.slice("#s=".length));

    expect(result).toMatchObject({ selectedCount: 1, excludedCount: 0 });
    expect(session.players).toHaveLength(1);
    await expect(service.createLink(recruitment, [])).rejects.toMatchObject({
      code: "NOT_ENOUGH_MEMBERS",
    });
  });

  it("caps a full queue at the first two games", async () => {
    const service = new TeamBuilderService(rankLookup, {
      baseUrl: "https://example.github.io/Inhouse_Queue_Bot/",
      fixedMemberTag: "클로버",
      callSize: 10,
      sessionTtlMs: 300_000,
    });

    const allMembers = members(40);
    const result = await service.createLink(recruitment, allMembers);
    const session = decodeTeamBuilderSession(new URL(result.url).hash.slice("#s=".length));

    expect(result.selectedCount).toBe(20);
    expect(result.excludedCount).toBe(20);
    expect(session.players).toHaveLength(20);
    expect(result.url.length).toBeLessThan(1_000);
  });
});
