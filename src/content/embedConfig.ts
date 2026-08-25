import type { EmbedConfig } from "./embedTypes.js";

/**
 * 이 파일은 임베드 디자인만 담당합니다.
 *
 * - 모든 항목은 선택사항이라 줄이나 블록 전체를 삭제해도 됩니다.
 * - null 또는 빈 문자열은 표시하지 않습니다.
 * - 알 수 없는 항목을 추가해도 오류 없이 무시합니다.
 * - icon_url과 iconURL을 모두 지원합니다.
 * - color는 0x57f287, "#57f287", "57f287" 중 편한 형식을 사용합니다.
 *
 * 표준 항목: color, title, description, url, author, footer, thumbnail,
 * image, fields, timestamp
 *
 * 모집 템플릿 토큰:
 * {creatorId}, {creatorMention}, {game}, {emoji}, {reservationPrefix},
 * {lead}, {scheduleSection}, {descriptionSection}, {providedDescription},
 * {scheduledFull}, {scheduledRelative}, {callSize}, {capacity},
 * {memberCount}, {summonFooter}, {createdAtIso}
 *
 * queue 토큰: {count}, {limit} 및 위의 모집 토큰 전체
 */
export const EMBED_CONFIG: EmbedConfig = {
  panel: {
    color: 0xf2ad83,
    title: "🎮 CR 내전 모집",
    description: [
      "원하는 버튼을 눌러 새 모집 채널을 만들 수 있어요.",
      "",
      "🐂 **협곡 내전 모집** — 지금 바로 협곡 모집",
      "❄️ **아람 내전 모집** — 지금 바로 아람 모집",
      "📅 **내전 예약** — 관리자가 날짜와 시간을 정해 미리 모집",
      "",
      "한 사람당 협곡·아람·예약 모집을 각각 하나씩 열 수 있어요.",
    ],
    footer: {
      text: "생성된 모집 채널은 이 패널과 같은 카테고리에 만들어집니다.",
      icon_url: null,
    },

    // 필요하면 아래 표준 항목을 추가하세요.
    // author: { name: "CR Clan", icon_url: "https://example.com/icon.png" },
    // thumbnail: { url: "https://example.com/thumbnail.png" },
    // image: { url: "https://example.com/banner.png" },
    // fields: [{ name: "안내", value: "내용", inline: false }],
  },

  recruitment: {
    colors: {
      RIFT: 0x57f287,
      ARAM: 0x3498db,
    },
    gameNames: {
      RIFT: "협곡",
      ARAM: "아람",
    },
    gameEmojis: {
      RIFT: "🐂",
      ARAM: "❄️",
    },
    title: "{emoji} {reservationPrefix}{game} 내전 모집중 {emoji}",
    description: [
      "{creatorMention}님이 {game} 내전을 모집하고 있어요!",
      "",
      "{lead}",
      "{scheduleSection}",
      "{descriptionSection}",
      "",
      "아래 버튼을 누르면 내전에 참가할 수 있어요!",
    ],
    footer: {
      text: "선착순 {callSize}명 호출 • {summonFooter}",
      icon_url: null,
    },
    timestamp: "{createdAtIso}",

    leads: {
      immediate: "**지금 {game} 내전 하실 분! 사람이 모이면 바로 시작해요.**",
      reservation: "**예약된 {game} 내전에 참가할 사람을 기다리고 있어요.**",
    },
    sections: {
      schedule: [
        "📅 **예정 시간**",
        "{scheduledFull} ({scheduledRelative})",
      ],
      details: ["📝 **설명**", "{providedDescription}"],
    },
    summonFooterTexts: {
      available: "생성자/관리자만 삭제 및 소환 가능",
      claimed: "올 소환 처리 중",
      used: "올 소환 사용 완료",
    },
    queue: {
      enabled: true,
      inline: true,
      primaryName: "{count}/{limit} 내전",
      secondName: "{count}/{limit} 내전",
      waitingName: "대기자",
      emptyPrimary: "아직 참가자가 없어요.",
      emptySecond: "다음 참가자를 기다리고 있어요.",
      emptyWaiting: "현재 대기자가 없어요.",
    },

    // panel과 마찬가지로 author, thumbnail, image, fields, url 등을 추가할 수 있습니다.
  },
};
