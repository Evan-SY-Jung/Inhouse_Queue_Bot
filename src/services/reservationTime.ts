import { DateTime, IANAZone } from "luxon";
import { INTERACTION_MESSAGES } from "../messages/interactionMessages.js";

export interface ParsedReservationTime {
  scheduledAt: number;
  timezoneLabel: string;
  resolvedZone: string;
}

export function parseOptionalReservationTime(
  dateInput: string,
  timeInput: string,
  timezoneInput: string,
  now = Date.now(),
): ParsedReservationTime | null {
  const date = dateInput.trim();
  const time = timeInput.trim();
  const timezone = timezoneInput.trim();
  const providedCount = [date, time, timezone].filter(Boolean).length;

  if (providedCount === 0) return null;
  if (providedCount !== 3) {
    throw new ReservationTimeError(
      INTERACTION_MESSAGES.reservation.incomplete,
    );
  }
  return parseReservationTime(date, time, timezone, now);
}

const ZONE_ALIASES: Readonly<Record<string, string>> = {
  UTC: "UTC",
  GMT: "UTC",
  KST: "Asia/Seoul",
  PT: "America/Los_Angeles",
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "UTC-7",
  MST: "UTC-7",
  MDT: "UTC-6",
  CST: "America/Chicago",
  CDT: "UTC-5",
  EST: "America/New_York",
  EDT: "UTC-4",
};

export class ReservationTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationTimeError";
  }
}

export function parseReservationTime(
  dateInput: string,
  timeInput: string,
  timezoneInput: string,
  now = Date.now(),
): ParsedReservationTime {
  const date = dateInput.trim();
  const rawTime = timeInput.trim();
  const time = rawTime.replace("/", ":");
  const timezoneLabel = timezoneInput.trim();

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    throw new ReservationTimeError(INTERACTION_MESSAGES.reservation.invalidDate);
  }
  if (!/^\d{2}[:/]\d{2}$/.test(rawTime)) {
    throw new ReservationTimeError(INTERACTION_MESSAGES.reservation.invalidTime);
  }
  if (!timezoneLabel) {
    throw new ReservationTimeError(INTERACTION_MESSAGES.reservation.missingTimezone);
  }

  const resolvedZone = resolveReservationTimezone(timezoneLabel);
  if (!isValidZone(resolvedZone)) {
    throw new ReservationTimeError(
      INTERACTION_MESSAGES.reservation.invalidTimezone,
    );
  }

  const parsed = DateTime.fromFormat(`${date} ${time}`, "LL/dd/yyyy HH:mm", {
    zone: resolvedZone,
    setZone: true,
    locale: "en-US",
  });

  if (!parsed.isValid || parsed.toFormat("LL/dd/yyyy HH:mm") !== `${date} ${time}`) {
    throw new ReservationTimeError(INTERACTION_MESSAGES.reservation.invalidDateTime);
  }
  if (parsed.toMillis() <= now) {
    throw new ReservationTimeError(INTERACTION_MESSAGES.reservation.notFuture);
  }

  return {
    scheduledAt: parsed.toMillis(),
    timezoneLabel,
    resolvedZone,
  };
}

export function resolveReservationTimezone(timezoneInput: string): string {
  const label = timezoneInput.trim();
  return ZONE_ALIASES[label.toUpperCase()] ?? label;
}

function isValidZone(zone: string): boolean {
  if (/^UTC[+-](?:\d|1\d|2[0-3])$/.test(zone)) return true;
  return zone === "UTC" || IANAZone.isValidZone(zone);
}
