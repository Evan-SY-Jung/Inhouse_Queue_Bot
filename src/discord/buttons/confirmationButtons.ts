import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { customIds } from "../customIds.js";

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
