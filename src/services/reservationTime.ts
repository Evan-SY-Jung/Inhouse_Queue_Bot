import { DateTime, IANAZone } from "luxon";

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
      "예약하려면 날짜, 시간, 타임존을 모두 입력해 주세요. 예약하지 않으려면 세 항목을 모두 비워 주세요.",
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
    throw new ReservationTimeError("날짜는 MM/DD/YYYY 형식으로 입력해 주세요.");
  }
  if (!/^\d{2}[:/]\d{2}$/.test(rawTime)) {
    throw new ReservationTimeError("시간은 HH:mm 형식의 24시간제로 입력해 주세요.");
  }
  if (!timezoneLabel) {
    throw new ReservationTimeError("타임존을 입력해 주세요.");
  }

  const resolvedZone = resolveReservationTimezone(timezoneLabel);
  if (!isValidZone(resolvedZone)) {
    throw new ReservationTimeError(
      "타임존이 올바르지 않아요. PST, EST, CST, MT 중 하나를 선택해 주세요.",
    );
  }

  const parsed = DateTime.fromFormat(`${date} ${time}`, "LL/dd/yyyy HH:mm", {
    zone: resolvedZone,
    setZone: true,
    locale: "en-US",
  });

  if (!parsed.isValid || parsed.toFormat("LL/dd/yyyy HH:mm") !== `${date} ${time}`) {
    throw new ReservationTimeError("존재하지 않는 날짜 또는 시간이거나 서머타임 전환 구간이에요.");
  }
  if (parsed.toMillis() <= now) {
    throw new ReservationTimeError("예약 시간은 현재보다 미래여야 해요.");
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
