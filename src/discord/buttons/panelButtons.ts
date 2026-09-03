import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { customIds } from "../customIds.js";

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
