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
    description: [
       "",
      "# 🎮 CR 내전 메인 툴",
      "",
      "-# 원하는 버튼을 눌러, 내전 대기열을 만들어보세요!",
      "",
      "> ### <:rift:1541797589827985478> **협곡 내전 모집**\n소환사의 협곡 내전 대기열을 생성합니다. 인당 최대 1개씩만 생성 가능하고, 최대 40명까지 모집 가능합니다.",
      "",
      "> ### <:aram:1541797572962812104> **아람 내전 모집**\n증강 아람 내전 대기열을 생성합니다. 인당 최대 1개씩만 생성 가능하고, 최대 40명까지 모집 가능합니다.",
      "",
    ],
    footer: {
      text: 'Copyright 2026. 알디. All rights reserved.',
      iconURL: 'https://cdn.discordapp.com/avatars/1210069602214613002/28579ea8ba6b5d9291f8a7d9a301c5c1.webp?size=100',
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
      RIFT: "<:rift:1541797589827985478>",
      ARAM: "<:aram:1541797572962812104>",
    },
    description: [
      "# {emoji} {reservationPrefix}{game} 내전 모집중 {emoji}",
      "-# {lead}",
      "",
      "> ### **👑 내전 주최자** \n바로... ||{creatorMention}||",
      "",
      "{scheduleSection}",
      "",
      "{descriptionSection}",
      "‎ ",
    ],
    footer: {
      text: 'Copyright 2026. 알디. All rights reserved.',
      iconURL: 'https://cdn.discordapp.com/avatars/1210069602214613002/28579ea8ba6b5d9291f8a7d9a301c5c1.webp?size=100',
    },
    leads: {
      immediate: "너만 오면 바로 고! 사람 모이면 바로 시작할거야!",
      reservation: "시간 많네! 다들 미리미리 신청하자!",
    },
    sections: {
      schedule: [
        "> ### 📅 예정 시간",
        "{scheduledFull} ({scheduledRelative})",
      ],
      details: ["> ### 📖 **정보**", "{providedDescription}"],
    },
    summonFooterTexts: {
      available: "삭제: 생성자/관리자 · 소환: 생성자/관리자/내전관리자",
      claimed: "올 소환 처리 중",
      used: "생성자 소환 사용 완료 · 관리자/내전관리자는 계속 사용 가능",
    },
    queue: {
      enabled: true,
      inline: true,
      primaryName: "{count}/{limit} 대기열",
      secondName: "{count}/{limit} 대기열",
      thirdName: "{count}/{limit} 대기열",
      fourthName: "{count}/{limit} 대기열",
      emptyPrimary: "아직 없음",
      emptySecond: "토너 내전 가보자잇!",
      emptyThird: "사람이 이렇게 많다고?",
      emptyFourth: "40명 내전 가보자잇!",
    },

    // panel과 마찬가지로 author, thumbnail, image, fields, url 등을 추가할 수 있습니다.
  },
};
