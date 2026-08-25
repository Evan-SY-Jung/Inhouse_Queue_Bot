import { describe, expect, it } from "vitest";
import type { QueueMember } from "../src/domain/models.js";
import {
  firstQueueMemberIds,
  formatQueuePosition,
} from "../src/services/queuePresentation.js";

describe("queue presentation", () => {
  it("formats first group, second group, and waiting positions", () => {
    expect(formatQueuePosition(1, 10, 20)).toContain("선착순 **1번째**");
    expect(formatQueuePosition(11, 10, 20)).toContain("전체 **11번째**");
    expect(formatQueuePosition(21, 10, 20)).toContain("대기 **1번째**");
  });

  it("selects only the earliest queue members", () => {
    const members = Array.from({ length: 12 }, (_, index) => ({
      sequence: index + 1,
      recruitmentId: 1,
      userId: `member-${index + 1}`,
      displayName: `멤버 ${index + 1}`,
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
});
