import type { QueueMember } from "../domain/models.js";

export function formatQueuePosition(
  position: number,
  callSize: number,
): string {
  if (position <= callSize) return `현재 선착순 **${position}번째**예요.`;
  return `현재 전체 **${position}번째**예요.`;
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
