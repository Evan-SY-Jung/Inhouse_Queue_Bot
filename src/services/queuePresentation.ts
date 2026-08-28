import type { QueueMember } from "../domain/models.js";

export function formatQueuePosition(
  position: number,
  callSize: number,
  capacity: number,
): string {
  if (position <= callSize) return `현재 선착순 **${position}번째**예요.`;
  if (position <= capacity) return `현재 전체 **${position}번째**예요.`;
  return `현재 전체 **${position}번째**, 대기 **${position - capacity}번째**예요.`;
}

export function firstQueueMemberIds(members: QueueMember[], limit: number): string[] {
  return members.slice(0, limit).map((member) => member.userId);
}

export function resolveSummonTargetLimit(
  memberCount: number,
  callSize: number,
  capacity: number,
): number {
  if (memberCount >= capacity) return capacity;
  if (memberCount >= callSize) return callSize;
  return 0;
}
