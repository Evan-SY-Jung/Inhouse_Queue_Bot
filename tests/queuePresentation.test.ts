import { describe, expect, it } from "vitest";
import { QUEUE_CAPACITY } from "../src/config.js";
import type { QueueMember } from "../src/domain/models.js";
import {
  firstQueueMemberIds,
  formatQueuePosition,
  resolveSummonTargetLimit,
} from "../src/services/queuePresentation.js";

describe("queue presentation", () => {
  it("caps every recruitment at 40 members", () => {
    expect(QUEUE_CAPACITY).toBe(40);
  });

  it("formats positions across the 40-player queue", () => {
    expect(formatQueuePosition(1, 10)).toContain("선착순 **1번째**");
    expect(formatQueuePosition(11, 10)).toContain("전체 **11번째**");
    expect(formatQueuePosition(40, 10)).toContain("전체 **40번째**");
  });

  it("selects only the earliest queue members", () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      sequence: index + 1,
      recruitmentId: 1,
      userId: `member-${index + 1}`,
      displayName: `멤버 ${index + 1}`,
      riotName: `Riot ${index + 1}`,
      riotTag: `TAG${index + 1}`,
      joinedAt: index + 1,
    })) satisfies QueueMember[];

    expect(firstQueueMemberIds(members, 10)).toEqual(
      Array.from({ length: 10 }, (_, index) => `member-${index + 1}`),
    );
    expect(firstQueueMemberIds(members.slice(0, 3), 10)).toEqual([
      "member-1",
      "member-2",
      "member-3",
    ]);
  });

  it("unlocks only complete 10- or 20-player summon groups", () => {
    expect(resolveSummonTargetLimit(0, 10)).toBe(0);
    expect(resolveSummonTargetLimit(9, 10)).toBe(0);
    expect(resolveSummonTargetLimit(10, 10)).toBe(10);
    expect(resolveSummonTargetLimit(13, 10)).toBe(10);
    expect(resolveSummonTargetLimit(19, 10)).toBe(10);
    expect(resolveSummonTargetLimit(20, 10)).toBe(20);
    expect(resolveSummonTargetLimit(22, 10)).toBe(20);
    expect(resolveSummonTargetLimit(40, 10)).toBe(20);
  });
});
