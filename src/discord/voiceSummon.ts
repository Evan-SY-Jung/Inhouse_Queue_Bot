import type { Guild, VoiceChannel } from "discord.js";
import type { QueueMember } from "../domain/models.js";

export interface VoiceSummonResult {
  movedIds: string[];
  notConnected: number;
  alreadyThere: number;
  failed: number;
}

interface MoveQueueMembersInput {
  guild: Guild;
  target: VoiceChannel;
  members: QueueMember[];
  limit: number;
  reason: string;
}

export async function moveQueueMembersToVoiceChannel({
  guild,
  target,
  members,
  limit,
  reason,
}: MoveQueueMembersInput): Promise<VoiceSummonResult> {
  const result: VoiceSummonResult = {
    movedIds: [],
    notConnected: 0,
    alreadyThere: 0,
    failed: 0,
  };

  for (const queuedMember of members.slice(0, limit)) {
    const voiceState = guild.voiceStates.cache.get(queuedMember.userId);
    if (!voiceState?.channelId) {
      result.notConnected += 1;
      continue;
    }
    if (voiceState.channelId === target.id) {
      result.alreadyThere += 1;
      continue;
    }

    try {
      const guildMember = voiceState.member ?? (await guild.members.fetch(queuedMember.userId));
      await guildMember.voice.setChannel(target, reason);
      result.movedIds.push(queuedMember.userId);
    } catch (error) {
      result.failed += 1;
      console.error(`음성 이동 실패 (${queuedMember.userId})`, error);
    }
  }

  return result;
}
