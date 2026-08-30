import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  parseOptionalReservationTime,
  parseReservationTime,
  ReservationTimeError,
} from "../src/services/reservationTime.js";

const NOW = DateTime.fromISO("2026-08-24T00:00:00Z").toMillis();

describe("parseReservationTime", () => {
  it("treats three empty scheduling fields as an immediate recruitment", () => {
    expect(parseOptionalReservationTime("", "", "", NOW)).toBeNull();
    expect(parseOptionalReservationTime("  ", "  ", "  ", NOW)).toBeNull();
  });

  it.each([
    ["12/31/2026", "", ""],
    ["", "21:30", ""],
    ["", "", "PST"],
    ["12/31/2026", "21:30", ""],
    ["12/31/2026", "", "PST"],
    ["", "21:30", "PST"],
  ])("rejects a partial optional schedule", (date, time, zone) => {
    expect(() => parseOptionalReservationTime(date, time, zone, NOW)).toThrow(
      /날짜, 시간, 타임존을 모두 입력/,
    );
  });

  it("parses an optional schedule only when all three fields exist", () => {
    const result = parseOptionalReservationTime("12/31/2026", "21:30", "PST", NOW);
    expect(result?.timezoneLabel).toBe("PST");
    expect(result?.scheduledAt).toBeGreaterThan(NOW);
  });

  it("parses MM/DD/YYYY, 24-hour time, and dynamic Pacific time", () => {
    const result = parseReservationTime("12/31/2026", "21:30", "PST", NOW);
    expect(result.resolvedZone).toBe("America/Los_Angeles");
    expect(DateTime.fromMillis(result.scheduledAt, { zone: "America/Los_Angeles" }).toISO()).toBe(
      "2026-12-31T21:30:00.000-08:00",
    );
  });

  it.each([
    ["EST", "America/New_York"],
    ["CST", "America/Chicago"],
    ["MT", "America/Denver"],
  ])("supports the %s reservation option", (label, zone) => {
    const result = parseReservationTime("01/01/2027", "09/05", label, NOW);
    expect(result.resolvedZone).toBe(zone);
    expect(DateTime.fromMillis(result.scheduledAt, { zone }).toFormat("HH:mm")).toBe("09:05");
  });

  it("rejects bad dates, zones, past times, and DST gaps", () => {
    expect(() => parseReservationTime("31/12/2026", "21:30", "PST", NOW)).toThrow(
      ReservationTimeError,
    );
    expect(() => parseReservationTime("12/31/2026", "21:30", "Moon/Base", NOW)).toThrow(
      ReservationTimeError,
    );
    expect(() => parseReservationTime("01/01/2026", "21:30", "PST", NOW)).toThrow(
      ReservationTimeError,
    );
    expect(() =>
      parseReservationTime(
        "03/08/2026",
        "02:30",
        "PST",
        DateTime.fromISO("2026-01-01T00:00:00Z").toMillis(),
      ),
    ).toThrow(ReservationTimeError);
  });
});
