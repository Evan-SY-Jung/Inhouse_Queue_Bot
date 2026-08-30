import { describe, expect, it } from "vitest";
import {
  PermissionFlagsBits,
  PermissionsBitField,
  type RepliableInteraction,
} from "discord.js";
import { EMBED_CONFIG } from "../src/content/embedConfig.js";
import type { QueueMember, Recruitment } from "../src/domain/models.js";
import { buildRecruitmentChannelName } from "../src/services/channelNames.js";
import { customIds, parseCustomId } from "../src/discord/customIds.js";
import { buildPanelEmbed, buildRecruitmentEmbed } from "../src/discord/embeds.js";
import {
  buildImmediateRecruitmentModal,
  buildJoinModal,
  buildPanelButtons,
  buildRecruitmentButtons,
  buildSetupModal,
  buildSummonModal,
} from "../src/discord/components.js";
import { applicationCommands } from "../src/discord/commands.js";
import {
  INHOUSE_MANAGER_ROLE_ID,
  INHOUSE_ROLE_ID,
  NEW_MEMBER_ROLE_ID,
  PANEL_CHANNEL_NAME,
  SUMMON_VOICE_CHANNEL_ID,
} from "../src/discord/constants.js";
import {
  buildRecruitmentPermissionOverwrites,
  canManageRecruitment,
  hasUnlimitedSummonPermission,
  interactionHasAnyRole,
  isInhouseRoleActionAllowed,
} from "../src/discord/helpers.js";
import {
  buildInitialRecruitmentMessagePayload,
  buildRecruitmentMessagePayload,
} from "../src/discord/messagePayloads.js";

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
  registrationState: "OPEN",
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
    riotName: `라이엇${index}`,
    riotTag: `TAG${index}`,
    joinedAt: index,
  };
}

describe("Discord views", () => {
  it("renders a two-row 40-player roster and starts row two after 20", () => {
    const empty = buildRecruitmentEmbed(recruitment, [], 10, 20).toJSON();
    const ten = buildRecruitmentEmbed(
      recruitment,
      Array.from({ length: 10 }, (_, index) => member(index + 1)),
      10,
      20,
    ).toJSON();
    const twentyOne = buildRecruitmentEmbed(
      recruitment,
      Array.from({ length: 21 }, (_, index) => member(index + 1)),
      10,
      40,
    ).toJSON();
    const forty = buildRecruitmentEmbed(
      recruitment,
      Array.from({ length: 40 }, (_, index) => member(index + 1)),
      10,
      40,
    ).toJSON();

    expect(empty.fields).toHaveLength(1);
    expect(empty.fields?.[0]?.name).toBe("0/10 대기열");
    expect(ten.fields).toHaveLength(2);
    expect(ten.fields?.[1]?.name).toBe("10/20 대기열");
    expect(twentyOne.fields).toHaveLength(4);
    expect(twentyOne.fields?.[0]?.name).toBe("10/10 대기열");
    expect(twentyOne.fields?.[1]?.name).toBe("20/20 대기열");
    expect(twentyOne.fields?.[2]).toMatchObject({
      name: "\u200b",
      value: "\u200b",
      inline: true,
    });
    expect(twentyOne.fields?.[3]?.name).toBe("21/30 대기열");
    expect(twentyOne.fields?.[3]?.value).toContain("<@600000000000000021>");

    expect(forty.fields).toHaveLength(5);
    expect(forty.fields?.[3]?.name).toBe("30/30 대기열");
    expect(forty.fields?.[4]?.name).toBe("40/40 대기열");
    expect(forty.fields?.[4]?.value).toContain("<@600000000000000040>");
    expect(forty.fields?.[0]?.value).toContain("라이엇1 #TAG1");
    expect(forty.description).toContain("<t:1800000000:F>");
    expect(forty.color).toBe(0x57f287);
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
    const descriptionOnly = buildRecruitmentEmbed(
      {
        ...recruitment,
        kind: "RIFT_NOW",
        channelNumber: 1,
        scheduledAt: null,
        timezoneInput: null,
      },
      [],
      10,
      40,
    ).toJSON();

    expect(configured.description).toContain("<t:1800000000:F>");
    expect(configured.description).toContain("골드 이하");
    expect(plain.description).not.toContain("<t:");
    expect(plain.description).not.toContain("골드 이하");
    expect(plain.description).toContain("너만 오면 바로 고! 사람 모이면 바로 시작할거야!");
    expect(descriptionOnly.description).toContain(
      "너만 오면 바로 고! 사람 모이면 바로 시작할거야!",
    );
    expect(descriptionOnly.description).toContain("골드 이하");
  });

  it("uses reservation copy but keeps a queue channel name when all schedule fields exist", () => {
    const scheduledQueue = {
      ...recruitment,
      kind: "RIFT_NOW" as const,
      channelNumber: 1,
    };
    const embed = buildRecruitmentEmbed(scheduledQueue, [], 10, 40).toJSON();

    expect(embed.description).toContain("시간 많네!");
    expect(embed.description).toContain("<t:1800000000:F>");
    expect(buildRecruitmentChannelName(scheduledQueue)).toBe("🏠ㆍ협곡대기열🄐");
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
    expect(parseCustomId(customIds.joinModal(7))).toEqual({
      action: "join-submit",
      id: 7,
    });
    expect(parseCustomId(customIds.close(7))).toEqual({ action: "close", id: 7 });
    expect(parseCustomId(customIds.teams(7))).toEqual({ action: "teams", id: 7 });
  });

  it("moves reservation setup into the Rift and ARAM recruitment buttons", () => {
    const panelRow = buildPanelButtons(1)[0]!.toJSON();
    expect(panelRow.components).toHaveLength(2);
    expect(panelRow.components).toMatchObject([
      { label: "협곡 내전 모집" },
      { label: "아람 내전 모집" },
    ]);
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

  it("builds optional scheduling, required Riot ID, and confirmation modal fields", () => {
    const setup = buildSetupModal().toJSON();
    const immediate = buildImmediateRecruitmentModal(1, "RIFT").toJSON();
    const join = buildJoinModal(7).toJSON();
    const summon = buildSummonModal(7).toJSON();

    expect(setup.components).toHaveLength(1);
    expect(immediate.custom_id).toBe("crq:immediate:rift:1");
    expect(immediate.components).toHaveLength(4);
    expect(immediate.components[0]).toMatchObject({
      component: {
        custom_id: "date",
        required: false,
      },
    });
    expect(immediate.components[1]).toMatchObject({
      component: { custom_id: "time", required: false },
    });
    expect(immediate.components[2]).toMatchObject({
      component: {
        custom_id: "timezone",
        min_values: 0,
        max_values: 1,
        required: false,
      },
    });
    expect(immediate.components[3]).toMatchObject({
      component: { custom_id: "description", required: false },
    });
    expect(join.components).toHaveLength(2);
    expect(join.components[0]).toMatchObject({
      component: { custom_id: "riot_name", required: true },
    });
    expect(join.components[1]).toMatchObject({
      component: { custom_id: "riot_tag", required: true },
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
    expect(botAllow & PermissionFlagsBits.MentionEveryone).toBe(
      PermissionFlagsBits.MentionEveryone,
    );
  });

  it("mentions @here outside the embed only on the initial recruitment message", () => {
    const initial = buildInitialRecruitmentMessagePayload(recruitment, [], {
      callSize: 10,
      queueCapacity: 40,
    });
    const refresh = buildRecruitmentMessagePayload(recruitment, [], {
      callSize: 10,
      queueCapacity: 40,
    });

    expect(initial.content).toBe("||@here||");
    expect(initial.allowedMentions).toEqual({ parse: ["everyone"] });
    expect("content" in refresh).toBe(false);
    expect(refresh.allowedMentions).toEqual({ parse: [] });
  });

  it("enables summon only when a complete group is queued", () => {
    const summonButton = (memberCount: number) => {
      const payload = buildRecruitmentMessagePayload(
        recruitment,
        Array.from({ length: memberCount }, (_, index) => member(index + 1)),
        { callSize: 10, queueCapacity: 40 },
      );
      return payload.components[1]?.toJSON().components[1];
    };

    expect(summonButton(9)).toMatchObject({ label: "전체 소환", disabled: true });
    expect(summonButton(10)).toMatchObject({ label: "전체 소환", disabled: false });
    expect(summonButton(13)).toMatchObject({ label: "전체 소환", disabled: false });
    expect(summonButton(20)).toMatchObject({ label: "전체 소환", disabled: false });
    expect(summonButton(22)).toMatchObject({ label: "전체 소환", disabled: false });
  });

  it("keeps summon clickable after regular use so managers can summon repeatedly", () => {
    const payload = buildRecruitmentMessagePayload(
      { ...recruitment, summonState: "USED" },
      Array.from({ length: 10 }, (_, index) => member(index + 1)),
      { callSize: 10, queueCapacity: 40 },
    );

    expect(payload.components[1]?.toJSON().components[1]).toMatchObject({
      label: "전체 소환",
      disabled: false,
    });
  });

  it("enables team formation after registration closes with at least one member", () => {
    const teamButton = (registrationState: Recruitment["registrationState"], count: number) =>
      buildRecruitmentMessagePayload(
        { ...recruitment, registrationState },
        Array.from({ length: count }, (_, index) => member(index + 1)),
        { callSize: 10, queueCapacity: 40 },
      ).components[0]!.toJSON().components[3];

    expect(teamButton("OPEN", 10)).toMatchObject({ label: "팀 짜기", disabled: true });
    expect(teamButton("CLOSED", 0)).toMatchObject({ label: "팀 짜기", disabled: true });
    expect(teamButton("CLOSED", 1)).toMatchObject({ label: "팀 짜기", disabled: false });
    expect(teamButton("CLOSED", 9)).toMatchObject({ label: "팀 짜기", disabled: false });
    expect(teamButton("CLOSED", 10)).toMatchObject({ label: "팀 짜기", disabled: false });
  });

  it("grants unlimited summon permission to administrators and inhouse managers", () => {
    const interaction = (
      roleIds: string[],
      permissions: bigint = 0n,
    ): RepliableInteraction =>
      ({
        member: { roles: roleIds },
        memberPermissions: new PermissionsBitField(permissions),
      }) as unknown as RepliableInteraction;

    expect(
      hasUnlimitedSummonPermission(
        interaction([INHOUSE_MANAGER_ROLE_ID]),
        INHOUSE_MANAGER_ROLE_ID,
      ),
    ).toBe(true);
    expect(
      hasUnlimitedSummonPermission(
        interaction([], PermissionFlagsBits.Administrator),
        INHOUSE_MANAGER_ROLE_ID,
      ),
    ).toBe(true);
    expect(hasUnlimitedSummonPermission(interaction([]), INHOUSE_MANAGER_ROLE_ID)).toBe(
      false,
    );
  });

  it("allows only creators or either operator type to manage recruitments", () => {
    const interaction = (
      userId: string,
      roleIds: string[] = [],
      permissions: bigint = 0n,
    ): RepliableInteraction =>
      ({
        user: { id: userId },
        member: { roles: roleIds },
        memberPermissions: new PermissionsBitField(permissions),
      }) as unknown as RepliableInteraction;
    const canManage = (value: RepliableInteraction) =>
      canManageRecruitment(
        value,
        "creator",
        INHOUSE_MANAGER_ROLE_ID,
        INHOUSE_ROLE_ID,
      );

    expect(canManage(interaction("creator"))).toBe(true);
    expect(canManage(interaction("member"))).toBe(false);
    expect(canManage(interaction("manager", [INHOUSE_MANAGER_ROLE_ID]))).toBe(true);
    expect(
      canManage(interaction("admin", [], PermissionFlagsBits.Administrator)),
    ).toBe(true);
    expect(canManage(interaction("creator", [INHOUSE_ROLE_ID]))).toBe(false);
    expect(
      canManage(
        interaction(
          "external-operator",
          [INHOUSE_ROLE_ID, INHOUSE_MANAGER_ROLE_ID],
          PermissionFlagsBits.Administrator,
        ),
      ),
    ).toBe(false);
  });

  it("collects Riot IDs from external inhouse and new-member roles", () => {
    const interaction = (roleIds: string[]): RepliableInteraction =>
      ({ member: { roles: roleIds } }) as unknown as RepliableInteraction;
    const requiresRiotId = (roleIds: string[]) =>
      interactionHasAnyRole(
        interaction(roleIds),
        [INHOUSE_ROLE_ID, NEW_MEMBER_ROLE_ID],
      );

    expect(requiresRiotId([INHOUSE_ROLE_ID])).toBe(true);
    expect(requiresRiotId([NEW_MEMBER_ROLE_ID])).toBe(true);
    expect(requiresRiotId([INHOUSE_ROLE_ID, NEW_MEMBER_ROLE_ID])).toBe(true);
    expect(requiresRiotId(["regular-role"])).toBe(false);
    expect(requiresRiotId([])).toBe(false);
    expect(NEW_MEMBER_ROLE_ID).toBe("721919159780507749");
  });

  it("allows the external inhouse role to join and leave only", () => {
    expect(isInhouseRoleActionAllowed("join")).toBe(true);
    expect(isInhouseRoleActionAllowed("join-submit")).toBe(true);
    expect(isInhouseRoleActionAllowed("leave")).toBe(true);

    for (const action of [
      "panel-rift",
      "panel-aram",
      "immediate",
      "close",
      "teams",
      "mention",
      "summon",
      "summon-confirm",
      "delete",
      "setup",
    ]) {
      expect(isInhouseRoleActionAllowed(action)).toBe(false);
    }
  });

  it("switches close to reopen while locking and unlocking join controls", () => {
    const closedRows = buildRecruitmentButtons(7, {
      registrationClosed: true,
      summonReady: true,
      teamReady: true,
    }).map((row) => row.toJSON());
    const openRows = buildRecruitmentButtons(7, {
      registrationClosed: false,
      summonReady: true,
      teamReady: false,
    }).map((row) => row.toJSON());

    expect(closedRows).toHaveLength(2);
    expect(closedRows[0]?.components).toMatchObject([
      { label: "신청하기" },
      { label: "쫄튀하기" },
      { label: "재오픈" },
      { label: "팀 짜기" },
      { label: "삭제" },
    ]);
    expect(closedRows[0]?.components[0]).toMatchObject({ disabled: true });
    expect(closedRows[0]?.components[1]).toMatchObject({ disabled: true });
    expect(closedRows[0]?.components[2]?.disabled).not.toBe(true);
    expect(closedRows[1]?.components).toMatchObject([
      { label: "전체 멘션" },
      { label: "전체 소환" },
    ]);
    expect(closedRows[1]?.components[1]).toMatchObject({ disabled: false });

    expect(openRows[0]?.components[0]).toMatchObject({ disabled: false });
    expect(openRows[0]?.components[1]).toMatchObject({ disabled: false });
    expect(openRows[0]?.components[2]).toMatchObject({ label: "마감하기" });
    expect(openRows[0]?.components[2]?.disabled).not.toBe(true);
    expect(INHOUSE_ROLE_ID).toBe("1412726855517081701");
    expect(INHOUSE_MANAGER_ROLE_ID).toBe("1542873758770135061");
  });
});
