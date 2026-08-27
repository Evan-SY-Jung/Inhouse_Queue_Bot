import { describe, expect, it } from "vitest";
import {
  IMMEDIATE_START_DELAY_MINUTES,
  parseImmediateStartDelay,
  scheduledAtFromDelay,
} from "../src/services/immediateStart.js";

describe("immediate queue start time", () => {
  it("supports exactly the selectable minute values", () => {
    expect(IMMEDIATE_START_DELAY_MINUTES).toEqual([
      10,
      15,
      20,
      30,
      45,
      60,
      90,
      120,
    ]);
    for (const minutes of IMMEDIATE_START_DELAY_MINUTES) {
      expect(parseImmediateStartDelay(String(minutes))).toBe(minutes);
    }
  });

  it("keeps the schedule absent when no delay is selected", () => {
    expect(parseImmediateStartDelay(undefined)).toBeNull();
    expect(scheduledAtFromDelay(1_000, null)).toBeNull();
  });

  it("calculates the absolute Discord timestamp from the selected delay", () => {
    expect(scheduledAtFromDelay(1_000, 15)).toBe(901_000);
    expect(parseImmediateStartDelay("25")).toBeNull();
  });
});
