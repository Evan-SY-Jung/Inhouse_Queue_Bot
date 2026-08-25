import { DateTime } from "luxon";
import type { Recruitment } from "../domain/models.js";
import { resolveReservationTimezone } from "./reservationTime.js";

const MAX_CHANNEL_NAME_LENGTH = 100;

export function buildRecruitmentChannelName(
  recruitment: Pick<
    Recruitment,
    "kind" | "gameType" | "channelNumber" | "scheduledAt" | "timezoneInput"
  >,
): string {
  if (recruitment.kind === "RESERVATION") {
    const dateLabel = recruitment.scheduledAt
      ? DateTime.fromMillis(recruitment.scheduledAt, {
          zone: resolveReservationTimezone(recruitment.timezoneInput ?? "UTC"),
        }).toFormat("LL월 dd일")
      : "예약";
    return `⏰ㆍ${dateLabel} 내전`.slice(0, MAX_CHANNEL_NAME_LENGTH);
  }

  const number = recruitment.channelNumber ?? 1;
  return `🏠ㆍ${gameTypeName(recruitment.gameType)} 내전 ${number}`.slice(
    0,
    MAX_CHANNEL_NAME_LENGTH,
  );
}

function gameTypeName(gameType: Recruitment["gameType"]): string {
  return gameType === "RIFT" ? "협곡" : "아람";
}
