import { DateTime } from "luxon";
import type { Recruitment } from "../domain/models.js";
import { resolveReservationTimezone } from "./reservationTime.js";

const MAX_CHANNEL_NAME_LENGTH = 100;
const PARENTHESIZED_A_CODE_POINT = 0x1f110;
const PARENTHESIZED_LETTER_COUNT = 26;

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
        }).toFormat("MM∕dd")
      : null;
    const baseName = `⏰ㆍ${gameTypeName(recruitment.gameType)}예약`;
    return `${baseName}${dateLabel ? `❨${dateLabel}❩` : ""}`.slice(
      0,
      MAX_CHANNEL_NAME_LENGTH,
    );
  }

  return `🏠ㆍ${gameTypeName(recruitment.gameType)}대기열${channelMarker(
    recruitment.channelNumber,
  )}`.slice(0, MAX_CHANNEL_NAME_LENGTH);
}

function gameTypeName(gameType: Recruitment["gameType"]): string {
  return gameType === "RIFT" ? "협곡" : "아람";
}

function channelMarker(channelNumber: number | null): string {
  const number =
    channelNumber && Number.isSafeInteger(channelNumber) && channelNumber > 0
      ? channelNumber
      : 1;
  if (number <= PARENTHESIZED_LETTER_COUNT) {
    return String.fromCodePoint(PARENTHESIZED_A_CODE_POINT + number - 1);
  }
  return `❨${number}❩`;
}
