import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { customIds } from "../customIds.js";

export interface RecruitmentButtonState {
  registrationClosed: boolean;
  summonReady: boolean;
  teamReady: boolean;
}

const DEFAULT_BUTTON_STATE: RecruitmentButtonState = {
  registrationClosed: false,
  summonReady: false,
  teamReady: false,
};

export function buildRecruitmentButtons(
  recruitmentId: number,
  state: RecruitmentButtonState = DEFAULT_BUTTON_STATE,
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
