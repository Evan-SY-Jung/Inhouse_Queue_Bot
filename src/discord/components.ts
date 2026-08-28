import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { GameType } from "../domain/models.js";
import { IMMEDIATE_START_DELAY_MINUTES } from "../services/immediateStart.js";
import { customIds } from "./customIds.js";
import { SUMMON_CONFIRMATION_TEXT } from "./constants.js";

export function buildPanelButtons(panelId: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.panelRift(panelId))
        .setLabel("협곡 내전 모집")
        .setEmoji("<:rift:1541797589827985478>")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customIds.panelAram(panelId))
        .setLabel("아람 내전 모집")
        .setEmoji("<:aram:1541797572962812104>")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customIds.panelReservation(panelId))
        .setLabel("내전 예약")
        .setEmoji("📅")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildRecruitmentButtons(
  recruitmentId: number,
  summonUsed = false,
  summonReady = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.join(recruitmentId))
        .setLabel("신청하기")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customIds.leave(recruitmentId))
        .setLabel("쫄튀하기")
        .setEmoji("🏃")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customIds.mention(recruitmentId))
        .setLabel("10명 멘션")
        .setEmoji("📣")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customIds.summon(recruitmentId))
        .setLabel(summonUsed ? "소환 사용됨" : "전체 소환")
        .setEmoji("☎️")
        .setDisabled(summonUsed || !summonReady)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customIds.delete(recruitmentId))
        .setLabel("삭제")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.manage(recruitmentId))
        .setLabel("관리 (준비 중)")
        .setEmoji("⚙️")
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildSetupModal(): ModalBuilder {
  const categoryInput = new TextInputBuilder()
    .setCustomId("category_id")
    .setPlaceholder("예: 123456789012345678")
    .setMinLength(17)
    .setMaxLength(22)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const categoryLabel = new LabelBuilder()
    .setLabel("모집 채널을 만들 카테고리 ID")
    .setDescription("개발자 모드에서 카테고리를 우클릭해 ID를 복사하세요.")
    .setTextInputComponent(categoryInput);

  return new ModalBuilder()
    .setCustomId(customIds.setupModal)
    .setTitle("내전 모집 패널 세팅")
    .addLabelComponents(categoryLabel);
}

export function buildImmediateRecruitmentModal(
  panelId: number,
  gameType: GameType,
): ModalBuilder {
  const startDelay = new StringSelectMenuBuilder()
    .setCustomId("start_delay")
    .setPlaceholder("시작 시간을 정하지 않음")
    .addOptions(
      IMMEDIATE_START_DELAY_MINUTES.map((minutes) => ({
        label: `${minutes}분 뒤`,
        value: String(minutes),
        description: `지금부터 ${minutes}분 뒤에 시작`,
      })),
    )
    .setMinValues(0)
    .setMaxValues(1)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(customIds.immediateModal(panelId, gameType))
    .setTitle(`${gameType === "RIFT" ? "협곡" : "아람"} 대기열 만들기`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("시작까지 남은 시간 (선택)")
        .setDescription("설정하면 각 사용자에게 현지 시간으로 표시됩니다.")
        .setStringSelectMenuComponent(startDelay),
      new LabelBuilder()
        .setLabel("내전 설명 (선택)")
        .setTextInputComponent(buildDescriptionInput()),
    );
}

export function buildReservationModal(panelId: number): ModalBuilder {
  const gameType = new StringSelectMenuBuilder()
    .setCustomId("game_type")
    .setPlaceholder("협곡 또는 아람 선택")
    .addOptions(
      {
        label: "협곡",
        value: "RIFT",
        description: "소환사의 협곡 내전",
        emoji: "<:rift:1541797589827985478> ",
      },
      {
        label: "아람",
        value: "ARAM",
        description: "증강 아람 내전",
        emoji: "<:aram:1541797572962812104> ",
      },
    )
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
  const date = new TextInputBuilder()
    .setCustomId("date")
    .setPlaceholder("12/31/2026")
    .setMinLength(10)
    .setMaxLength(10)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const time = new TextInputBuilder()
    .setCustomId("time")
    .setPlaceholder("21:30")
    .setMinLength(5)
    .setMaxLength(5)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const timezone = new StringSelectMenuBuilder()
    .setCustomId("timezone")
    .setPlaceholder("미국 타임존 선택")
    .addOptions(
      {
        label: "PST — 미국 서부",
        value: "PST",
        description: "California · Nevada · Oregon · Washington 등...",
      },
      {
        label: "EST — 미국 동부",
        value: "EST",
        description: "Georgia · New York · Pennsylvania · Virginia 등...",
      },
      {
        label: "CST — 미국 중부",
        value: "CST",
        description: "Illinois · Iowa · Minnesota · Mississippi 등...",
      },
      {
        label: "MT — 미국 산악",
        value: "MT",
        description: "Arizona · Colorado · Montana · Utah 등...",
      },
    )
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(customIds.reservationModal(panelId))
    .setTitle("내전 예약")
    .addLabelComponents(
      new LabelBuilder().setLabel("게임 종류").setStringSelectMenuComponent(gameType),
      new LabelBuilder().setLabel("날짜 (MM/DD/YYYY)").setTextInputComponent(date),
      new LabelBuilder().setLabel("시간 (HH:mm, 24시간제)").setTextInputComponent(time),
      new LabelBuilder()
        .setLabel("타임존")
        .setDescription("예약 시간은 다른 사람의 Discord에서 각자 현지 시간으로 표시됩니다.")
        .setStringSelectMenuComponent(timezone),
      new LabelBuilder()
        .setLabel("내전 설명 (선택)")
        .setTextInputComponent(buildDescriptionInput()),
    );
}

export function buildSummonModal(recruitmentId: number): ModalBuilder {
  const confirmation = new TextInputBuilder()
    .setCustomId("confirmation")
    .setPlaceholder(SUMMON_CONFIRMATION_TEXT)
    .setMinLength(SUMMON_CONFIRMATION_TEXT.length)
    .setMaxLength(SUMMON_CONFIRMATION_TEXT.length)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(customIds.summonModal(recruitmentId))
    .setTitle("전체 소환 최종 확인")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('확인을 위해 "전부 소환" 입력')
        .setTextInputComponent(confirmation),
    );
}

function buildDescriptionInput(): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId("description")
    .setPlaceholder("티어 제한, 진행 방식 등")
    .setMaxLength(1_000)
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph);
}
