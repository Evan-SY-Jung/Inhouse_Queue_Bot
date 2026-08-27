import { describe, expect, it } from "vitest";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { EMBED_CONFIG } from "../src/content/embedConfig.js";
import type { QueueMember, Recruitment } from "../src/domain/models.js";
import { buildRecruitmentChannelName } from "../src/services/channelNames.js";
import { customIds, parseCustomId } from "../src/discord/customIds.js";
import { buildPanelEmbed, buildRecruitmentEmbed } from "../src/discord/embeds.js";
import {
  buildImmediateRecruitmentModal,
  buildRecruitmentButtons,
  buildReservationModal,
  buildSetupModal,
  buildSummonModal,
} from "../src/discord/components.js";
import { applicationCommands } from "../src/discord/commands.js";
import {
  PANEL_CHANNEL_NAME,
  SUMMON_VOICE_CHANNEL_ID,
} from "../src/discord/constants.js";
import { buildRecruitmentPermissionOverwrites } from "../src/discord/helpers.js";

const recruitment: Recruitment = {
  id: 7,
  panelId: 1,
  guildId: "100000000000000000",
  categoryId: "200000000000000000",
  channelId: "300000000000000000",
  messageId: "400000000000000000",
  creatorId: "500000000000000000",
  kind: "RESERVATION",
  gameType: "RIFT",
  channelNumber: null,
  description: "골드 이하",
  scheduledAt: 1_800_000_000_000,
  timezoneInput: "PT",
  status: "OPEN",
  summonState: "AVAILABLE",
  createdAt: 1_700_000_000_000,
  closedAt: null,
};

function member(index: number): QueueMember {
  return {
    sequence: index,
    recruitmentId: recruitment.id,
    userId: String(600_000_000_000_000_000n + BigInt(index)),
    displayName: `참가자 ${index}`,
    joinedAt: index,
  };
}

describe("Discord views", () => {
  it("reveals the 20-player roster only after 10 and waiters after 20", () => {
    const empty = buildRecruitmentEmbed(recruitment, [], 10, 20).toJSON();
    const ten = buildRecruitmentEmbed(
      recruitment,
      Array.from({ length: 10 }, (_, index) => member(index + 1)),
      10,
      20,
    ).toJSON();
    const embed = buildRecruitmentEmbed(
      recruitment,
      Array.from({ length: 23 }, (_, index) => member(index + 1)),
      10,
      20,
    ).toJSON();

    expect(empty.fields).toHaveLength(1);
    expect(empty.fields?.[0]?.name).toBe("0/10 대기열");
    expect(ten.fields).toHaveLength(2);
    expect(ten.fields?.[1]?.name).toBe("10/20 대기열");
    expect(embed.fields).toHaveLength(3);
    expect(embed.fields?.[0]?.name).toBe("10/10 대기열");
    expect(embed.fields?.[1]?.name).toBe("20/20 대기열");
    expect(embed.fields?.[2]?.name).toBe("대기자");
    expect(embed.fields?.[0]?.value).toContain("<@600000000000000001>");
    expect(embed.fields?.[0]?.value).not.toContain("<@600000000000000011>");
    expect(embed.fields?.[1]?.value).toContain("<@600000000000000011>");
    expect(embed.fields?.[2]?.value).toContain("<@600000000000000021>");
    expect(embed.description).toContain("<t:1800000000:F>");
    expect(embed.color).toBe(0x57f287);
  });

  it("shows local-time and description sections for immediate queues only when provided", () => {
    const configured = buildRecruitmentEmbed(
      { ...recruitment, kind: "RIFT_NOW", channelNumber: 1 },
      [],
      10,
      20,
    ).toJSON();
    const plain = buildRecruitmentEmbed(
      {
        ...recruitment,
        kind: "RIFT_NOW",
        channelNumber: 1,
        scheduledAt: null,
        description: null,
      },
      [],
      10,
      20,
    ).toJSON();

    expect(configured.description).toContain("<t:1800000000:F>");
    expect(configured.description).toContain("골드 이하");
    expect(plain.description).not.toContain("<t:");
    expect(plain.description).not.toContain("골드 이하");
  });

  it("accepts optional standard embed properties and ignores unknown additions", () => {
    const originalPanel = EMBED_CONFIG.panel;
    const originalRecruitment = EMBED_CONFIG.recruitment;
    const iconUrl = "https://i.imgur.com/AfFp7pu.png";

    try {
      EMBED_CONFIG.panel = {
        color: "#123456",
        description: "제목 없는 패널",
        url: "https://example.com/panel",
        author: { name: "CR Clan", icon_url: iconUrl },
        footer: { text: "패널 푸터", icon_url: iconUrl },
        thumbnail: { url: iconUrl },
        image: iconUrl,
        fields: [{ name: "추가 필드", value: "추가 내용", inline: true }],
        unknown_custom_property: { anything: true },
      };
      EMBED_CONFIG.recruitment = {
        title: null,
        description: null,
        footer: { text: "선착순 {callSize}명", iconURL: iconUrl },
        queue: null,
        another_unknown_property: "ignored",
      };

      const panel = buildPanelEmbed().toJSON();
      const queue = buildRecruitmentEmbed(recruitment, [], 10, 20).toJSON();

      expect(panel.title).toBeUndefined();
      expect(panel.color).toBe(0x123456);
      expect(panel.author).toMatchObject({ name: "CR Clan", icon_url: iconUrl });
      expect(panel.footer).toEqual({ text: "패널 푸터", icon_url: iconUrl });
      expect(panel.thumbnail?.url).toBe(iconUrl);
      expect(panel.image?.url).toBe(iconUrl);
      expect(panel.fields?.[0]).toMatchObject({
        name: "추가 필드",
        value: "추가 내용",
        inline: true,
      });
      expect(queue.title).toBeUndefined();
      expect(queue.description).toBeUndefined();
      expect(queue.fields).toBeUndefined();
      expect(queue.footer).toEqual({ text: "선착순 10명", icon_url: iconUrl });
    } finally {
      if (originalPanel === undefined) delete EMBED_CONFIG.panel;
      else EMBED_CONFIG.panel = originalPanel;
      if (originalRecruitment === undefined) delete EMBED_CONFIG.recruitment;
      else EMBED_CONFIG.recruitment = originalRecruitment;
    }
  });

  it("keeps running when either complete embed configuration is removed", () => {
    const originalPanel = EMBED_CONFIG.panel;
    const originalRecruitment = EMBED_CONFIG.recruitment;

    try {
      delete EMBED_CONFIG.panel;
      delete EMBED_CONFIG.recruitment;

      const panel = buildPanelEmbed().toJSON();
      const queue = buildRecruitmentEmbed(recruitment, [], 10, 20).toJSON();
      expect(panel.description).toBe("\u200b");
      expect(queue.description).toBe("\u200b");
    } finally {
      if (originalPanel === undefined) delete EMBED_CONFIG.panel;
      else EMBED_CONFIG.panel = originalPanel;
      if (originalRecruitment === undefined) delete EMBED_CONFIG.recruitment;
      else EMBED_CONFIG.recruitment = originalRecruitment;
    }
  });

  it("safely ignores empty or invalid optional embed values", () => {
    const originalPanel = EMBED_CONFIG.panel;
    try {
      EMBED_CONFIG.panel = {
        color: "not-a-color",
        title: "",
        description: [],
        url: "not-a-url",
        author: {},
        footer: {},
        thumbnail: {},
        image: {},
        fields: [{}, { name: "", value: "" }],
        timestamp: "not-a-date",
      };

      expect(buildPanelEmbed().toJSON()).toEqual({ description: "\u200b" });
    } finally {
      if (originalPanel === undefined) delete EMBED_CONFIG.panel;
      else EMBED_CONFIG.panel = originalPanel;
    }
  });

  it("continues to render v0.2-style recruitment settings", () => {
    const originalRecruitment = EMBED_CONFIG.recruitment;
    try {
      EMBED_CONFIG.recruitment = {
        colors: { RIFT: 0x57f287 },
        gameNames: { RIFT: "협곡" },
        gameEmojis: { RIFT: "🐂" },
        titles: { reservation: "{emoji} 기존 {game} 제목" },
        creatorLine: "{creatorMention} 생성",
        leads: { reservation: "예약 안내" },
        scheduleHeading: "예정 시간",
        descriptionHeading: "설명",
        joinPrompt: "참가하세요",
        fields: {
          primaryName: "{count}/{limit}",
          emptyPrimary: "비어 있음",
        },
        footers: { available: "선착순 {callSize}명" },
      };

      const embed = buildRecruitmentEmbed(recruitment, [], 10, 20).toJSON();
      expect(embed.title).toBe("🐂 기존 협곡 제목");
      expect(embed.description).toContain("예정 시간");
      expect(embed.fields?.[0]).toMatchObject({ name: "0/10", value: "비어 있음" });
      expect(embed.footer?.text).toBe("선착순 10명");
    } finally {
      if (originalRecruitment === undefined) delete EMBED_CONFIG.recruitment;
      else EMBED_CONFIG.recruitment = originalRecruitment;
    }
  });

  it("round-trips component custom IDs", () => {
    expect(parseCustomId(customIds.join(7))).toEqual({ action: "join", id: 7 });
    expect(parseCustomId(customIds.panelReservation(3))).toEqual({
      action: "panel-reservation",
      id: 3,
    });
    expect(parseCustomId(customIds.immediateModal(3, "ARAM"))).toEqual({
      action: "immediate",
      id: 3,
      gameType: "ARAM",
    });
    expect(parseCustomId(customIds.summonModal(7))).toEqual({
      action: "summon-confirm",
      id: 7,
    });
  });

  it("builds per-game lettered queue names and local-date reservation names", () => {
    expect(
      buildRecruitmentChannelName({
        ...recruitment,
        kind: "RIFT_NOW",
        channelNumber: 2,
      }),
    ).toBe("🏠ㆍ협곡대기열🄑");
    expect(
      buildRecruitmentChannelName({
        ...recruitment,
        kind: "ARAM_NOW",
        gameType: "ARAM",
        channelNumber: 1,
      }),
    ).toBe("🏠ㆍ아람대기열🄐");
    expect(buildRecruitmentChannelName(recruitment)).toBe(
      "⏰ㆍ협곡예약❨01∕15❩",
    );
    expect(PANEL_CHANNEL_NAME).toBe("👊ㆍ내전-만들기");

    for (let number = 1; number <= 26; number += 1) {
      expect(
        buildRecruitmentChannelName({
          ...recruitment,
          kind: "RIFT_NOW",
          channelNumber: number,
        }),
      ).toBe(`🏠ㆍ협곡대기열${String.fromCodePoint(0x1f110 + number - 1)}`);
    }

    const aram = buildRecruitmentEmbed(
      { ...recruitment, gameType: "ARAM" },
      [],
      10,
      20,
    ).toJSON();
    expect(aram.color).toBe(0x3498db);
  });

  it("registers the slash command as guild-only and administrator-only", () => {
    const command = applicationCommands[0];
    expect(command?.name).toBe("내전");
    expect(command?.default_member_permissions).toBe("8");
    expect(command?.contexts).toEqual([0]);
    expect(command?.options?.[0]?.name).toBe("세팅");
  });

  it("builds required setup/reservation/confirmation modal fields", () => {
    const setup = buildSetupModal().toJSON();
    const immediate = buildImmediateRecruitmentModal(1, "RIFT").toJSON();
    const reservation = buildReservationModal(1).toJSON();
    const summon = buildSummonModal(7).toJSON();

    expect(setup.components).toHaveLength(1);
    expect(immediate.custom_id).toBe("crq:immediate:rift:1");
    expect(immediate.components).toHaveLength(2);
    expect(immediate.components[0]).toMatchObject({
      component: {
        custom_id: "start_delay",
        min_values: 0,
        max_values: 1,
        required: false,
        options: [
          expect.objectContaining({ value: "10" }),
          expect.objectContaining({ value: "15" }),
          expect.objectContaining({ value: "20" }),
          expect.objectContaining({ value: "30" }),
          expect.objectContaining({ value: "45" }),
          expect.objectContaining({ value: "60" }),
          expect.objectContaining({ value: "90" }),
          expect.objectContaining({ value: "120" }),
        ],
      },
    });
    expect(immediate.components[1]).toMatchObject({
      component: { custom_id: "description", required: false },
    });
    expect(reservation.components).toHaveLength(5);
    expect(reservation.components[0]).toMatchObject({
      component: {
        custom_id: "game_type",
        options: [
          expect.objectContaining({ value: "RIFT" }),
          expect.objectContaining({ value: "ARAM" }),
        ],
      },
    });
    expect(reservation.components[3]).toMatchObject({
      component: {
        custom_id: "timezone",
        options: [
          expect.objectContaining({ value: "PST" }),
          expect.objectContaining({ value: "EST" }),
          expect.objectContaining({ value: "CST" }),
          expect.objectContaining({ value: "MT" }),
        ],
      },
    });
    expect(summon.components).toHaveLength(1);
    expect(summon.custom_id).toBe("crq:summon-confirm:7");
    expect(SUMMON_VOICE_CHANNEL_ID).toBe("812822837495988244");
  });

  it("denies parent-channel messages but permits thread messages", () => {
    const overwrites = buildRecruitmentPermissionOverwrites([], "everyone", "bot");
    const everyone = overwrites.find(
      (overwrite) => !("channel" in overwrite) && overwrite.id === "everyone",
    );
    const bot = overwrites.find(
      (overwrite) => !("channel" in overwrite) && overwrite.id === "bot",
    );

    const everyoneDeny = PermissionsBitField.resolve(
      everyone && "deny" in everyone ? everyone.deny : [],
    );
    const everyoneAllow = PermissionsBitField.resolve(
      everyone && "allow" in everyone ? everyone.allow : [],
    );
    const botAllow = PermissionsBitField.resolve(bot && "allow" in bot ? bot.allow : []);

    expect(everyoneDeny).toBe(
      PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.CreatePublicThreads |
        PermissionFlagsBits.CreatePrivateThreads,
    );
    expect(everyoneAllow).toBe(PermissionFlagsBits.SendMessagesInThreads);
    expect(botAllow & PermissionFlagsBits.SendMessages).toBe(PermissionFlagsBits.SendMessages);
  });

  it("keeps management disabled and disables summon after use", () => {
    const rows = buildRecruitmentButtons(7, true).map((row) => row.toJSON());
    expect(rows).toHaveLength(2);
    expect(rows[0]?.components[3]).toMatchObject({ label: "소환 사용됨", disabled: true });
    expect(rows[1]?.components[0]).toMatchObject({ label: "관리 (준비 중)", disabled: true });
  });
});
