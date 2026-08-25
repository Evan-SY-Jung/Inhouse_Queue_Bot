import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const inhouseCommand = new SlashCommandBuilder()
  .setName("내전")
  .setDescription("내전 대기열 봇 관리")
  .addSubcommand((subcommand) =>
    subcommand.setName("세팅").setDescription("내전 모집 패널과 채널을 생성합니다."),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

export const applicationCommands = [inhouseCommand.toJSON()];
