import type { QueueMember } from "../domain/models.js";
import { INTERACTION_MESSAGES } from "../messages/interactionMessages.js";

export function formatQueuePosition(
  position: number,
  callSize: number,
): string {
  if (position <= callSize) {
    return INTERACTION_MESSAGES.queue.firstPosition(position);
  }
  return INTERACTION_MESSAGES.queue.overallPosition(position);
}

export function firstQueueMemberIds(members: QueueMember[], limit: number): string[] {
  return members.slice(0, limit).map((member) => member.userId);
}

export function resolveSummonTargetLimit(
  memberCount: number,
  callSize: number,
): number {
  const secondGameCapacity = callSize * 2;
  if (memberCount >= secondGameCapacity) return secondGameCapacity;
  if (memberCount >= callSize) return callSize;
  return 0;
}
