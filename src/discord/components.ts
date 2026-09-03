import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { GameType, QueueMember } from "../domain/models.js";
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
    ),
  ];
}

export interface RecruitmentButtonState {
  registrationClosed: boolean;
  summonReady: boolean;
  teamReady: boolean;
}

export function buildRecruitmentButtons(
  recruitmentId: number,
  state: RecruitmentButtonState = {
    registrationClosed: false,
    summonReady: false,
    teamReady: false,
  },
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.join(recruitmentId))
        .setLabel("신청하기")
        .setEmoji("✅")
        .setDisabled(state.registrationClosed)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customIds.leave(recruitmentId))
        .setLabel("쫄튀하기")
        .setEmoji("🏃")
        .setDisabled(state.registrationClosed)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customIds.mention(recruitmentId))
        .setLabel("전체 멘션")
        .setEmoji("📣")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customIds.summon(recruitmentId))
        .setLabel("전체 소환")
        .setEmoji("☎️")
        .setDisabled(!state.summonReady)
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.close(recruitmentId))
        .setLabel(state.registrationClosed ? "재오픈" : "마감하기")
        .setEmoji(state.registrationClosed ? "🔓" : "🔒")
        .setStyle(
          state.registrationClosed ? ButtonStyle.Success : ButtonStyle.Secondary,
        ),
      new ButtonBuilder()
        .setCustomId(customIds.teams(recruitmentId))
        .setLabel("팀 짜기")
        .setEmoji("⚔️")
        .setDisabled(!state.teamReady)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(customIds.manualAdd(recruitmentId))
        .setLabel("수동 추가")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customIds.manualRemove(recruitmentId))
        .setLabel("수동 제외")
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customIds.delete(recruitmentId))
        .setLabel("삭제")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function buildManualAddModal(recruitmentId: number): ModalBuilder {
  const memberSelect = new UserSelectMenuBuilder()
    .setCustomId("manual_member")
    .setPlaceholder("닉네임 일부를 입력해 서버 멤버 검색")
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(customIds.manualAddModal(recruitmentId))
    .setTitle("대기열 수동 추가")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("추가할 서버 멤버")
        .setDescription("닉네임 일부만 입력해도 Discord가 가까운 후보를 보여줘요.")
        .setUserSelectMenuComponent(memberSelect),
    );
}

export function buildManualRemoveModal(
  recruitmentId: number,
  members: readonly QueueMember[],
): ModalBuilder {
  const pageSize = 25;
  const pageCount = Math.ceil(members.length / pageSize);
  const labels: LabelBuilder[] = [];
  for (let offset = 0; offset < members.length; offset += pageSize) {
    const page = Math.floor(offset / pageSize);
    const pageMembers = members.slice(offset, offset + pageSize);
    const firstPosition = offset + 1;
    const lastPosition = offset + pageMembers.length;
    const required = pageCount === 1;
    const select = new StringSelectMenuBuilder()
      .setCustomId(`manual_remove_${page}`)
      .setPlaceholder(`${firstPosition}~${lastPosition}번째 참가자 선택`)
      .setMinValues(required ? 1 : 0)
      .setMaxValues(1)
      .setRequired(required)
      .addOptions(
        pageMembers.map((member, index) => ({
          label: `${offset + index + 1}. ${member.displayName}`.slice(0, 100),
          value: member.userId,
        })),
      );
    labels.push(
      new LabelBuilder()
        .setLabel(`${firstPosition}~${lastPosition}번째 대기열`)
        .setDescription(
          required
            ? "제외할 참가자를 선택하세요."
            : "두 목록 중 한 곳에서만 참가자를 선택하세요.",
        )
        .setStringSelectMenuComponent(select),
    );
  }
  return new ModalBuilder()
    .setCustomId(customIds.manualRemoveModal(recruitmentId))
    .setTitle("대기열 수동 제외")
    .addLabelComponents(labels);
}

export function buildDeleteConfirmationButtons(
  recruitmentId: number,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customIds.deleteConfirm(recruitmentId))
        .setLabel("정말 삭제")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customIds.deleteCancel(recruitmentId))
        .setLabel("취소")
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
  const date = new TextInputBuilder()
    .setCustomId("date")
    .setPlaceholder("12/31/2026")
    .setMaxLength(10)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);
  const time = new TextInputBuilder()
    .setCustomId("time")
    .setPlaceholder("21:30")
    .setMaxLength(5)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);
  const timezone = buildTimezoneSelect(false);

  return new ModalBuilder()
    .setCustomId(customIds.immediateModal(panelId, gameType))
    .setTitle(`${gameType === "RIFT" ? "협곡" : "아람"} 내전 모집`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("날짜 (선택, MM/DD/YYYY)")
        .setTextInputComponent(date),
      new LabelBuilder()
        .setLabel("시간 (선택, HH:mm 24시간제)")
        .setTextInputComponent(time),
      new LabelBuilder()
        .setLabel("타임존 (선택)")
        .setDescription("예약하려면 날짜·시간·타임존을 모두 입력하세요.")
        .setStringSelectMenuComponent(timezone),
      new LabelBuilder()
        .setLabel("내전 설명 (선택)")
        .setTextInputComponent(buildDescriptionInput()),
    );
}

export function buildJoinModal(recruitmentId: number): ModalBuilder {
  const riotName = new TextInputBuilder()
    .setCustomId("riot_name")
    .setPlaceholder("게임 이름")
    .setMinLength(1)
    .setMaxLength(32)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const riotTag = new TextInputBuilder()
    .setCustomId("riot_tag")
    .setPlaceholder("NA1 또는 1234 (# 제외 가능)")
    .setMinLength(1)
    .setMaxLength(10)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(customIds.joinModal(recruitmentId))
    .setTitle("내전 신청")
    .addLabelComponents(
      new LabelBuilder().setLabel("라이엇 닉네임").setTextInputComponent(riotName),
      new LabelBuilder().setLabel("라이엇 태그").setTextInputComponent(riotTag),
    );
}

function buildTimezoneSelect(required: boolean): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId("timezone")
    .setPlaceholder("타임존을 선택하지 않음")
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
    .setMinValues(required ? 1 : 0)
    .setMaxValues(1)
    .setRequired(required);
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
