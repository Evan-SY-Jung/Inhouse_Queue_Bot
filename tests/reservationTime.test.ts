import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  parseReservationTime,
  ReservationTimeError,
} from "../src/services/reservationTime.js";

const NOW = DateTime.fromISO("2026-08-24T00:00:00Z").toMillis();

describe("parseReservationTime", () => {
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
