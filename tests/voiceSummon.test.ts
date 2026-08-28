import { describe, expect, it } from "vitest";
import type { Guild, VoiceChannel } from "discord.js";
import type { QueueMember } from "../src/domain/models.js";
import { moveQueueMembersToVoiceChannel } from "../src/discord/voiceSummon.js";

describe("voice summon", () => {
  it("moves only the earliest members within the resolved target limit", async () => {
    const movedIds: string[] = [];
    const target = { id: "target-voice" } as VoiceChannel;
    const members = Array.from({ length: 22 }, (_, index) => ({
      sequence: index + 1,
      recruitmentId: 1,
      userId: `member-${index + 1}`,
      displayName: `멤버 ${index + 1}`,
      joinedAt: index + 1,
    })) satisfies QueueMember[];
    const states = new Map(
      members.map((member) => [
        member.userId,
        {
          channelId: "source-voice",
          member: {
            voice: {
              setChannel: async (receivedTarget: VoiceChannel) => {
                expect(receivedTarget).toBe(target);
                movedIds.push(member.userId);
              },
            },
          },
        },
      ]),
    );
    const guild = {
      voiceStates: { cache: states },
      members: { fetch: async () => undefined },
    } as unknown as Guild;

    const result = await moveQueueMembersToVoiceChannel({
      guild,
      target,
      members,
      limit: 20,
      reason: "test",
    });

    expect(movedIds).toEqual(
      Array.from({ length: 20 }, (_, index) => `member-${index + 1}`),
    );
    expect(result).toEqual({
      movedIds,
      notConnected: 0,
      alreadyThere: 0,
      failed: 0,
    });
  });
});
