import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type Interaction,
  type ModalSubmitInteraction,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";
import type {
  ClaimRecruitmentInput,
  GameType,
  Panel,
  Recruitment,
} from "../domain/models.js";
import type { RecruitmentRepository } from "../db/repository.js";
import { buildRecruitmentChannelName } from "../services/channelNames.js";
import {
  firstQueueMemberIds,
  formatQueuePosition,
} from "../services/queuePresentation.js";
import {
  parseReservationTime,
  ReservationTimeError,
} from "../services/reservationTime.js";
import {
  parseImmediateStartDelay,
  scheduledAtFromDelay,
} from "../services/immediateStart.js";
import {
  buildImmediateRecruitmentModal,
  buildReservationModal,
  buildSetupModal,
  buildSummonModal,
} from "./components.js";
import {
  ALL_MENTION_COOLDOWN_KEY,
  MENTION_MESSAGE_LIFETIME_MS,
  PANEL_CHANNEL_NAME,
  RECRUITMENT_THREAD_NAME,
  SUMMON_CONFIRMATION_TEXT,
  SUMMON_VOICE_CHANNEL_ID,
} from "./constants.js";
import { parseCustomId } from "./customIds.js";
import { fetchGuildChannel } from "./discordErrors.js";
import { DiscordStateService } from "./DiscordStateService.js";
import {
  asCategory,
  assertBotCanCreateRecruitments,
  buildRecruitmentPermissionOverwrites,
  isAdministrator,
  parseSnowflake,
} from "./helpers.js";
import {
  buildPanelMessagePayload,
  buildRecruitmentMessagePayload,
} from "./messagePayloads.js";
import {
  moveQueueMembersToVoiceChannel,
  type VoiceSummonResult,
} from "./voiceSummon.js";

type RecruitmentInteraction = ButtonInteraction | ModalSubmitInteraction;

export class BotController {
  readonly client: Client;
  private readonly stateService: DiscordStateService;

  constructor(
    private readonly repository: RecruitmentRepository,
    private readonly config: AppConfig,
  ) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });
    this.stateService = new DiscordStateService(this.client, repository, config);
  }

  async start(): Promise<void> {
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.client.on(Events.ChannelDelete, (channel) => {
      const now = Date.now();
      this.repository.closePanelByChannel(channel.id, now);
      this.repository.closeRecruitmentByChannel(channel.id, now);
    });
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`로그인 완료: ${readyClient.user.tag}`);
      void this.stateService
        .reconcilePersistentState()
        .catch((error) => console.error("저장된 Discord 상태 복구 실패", error));
    });

    await this.client.login(this.config.token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
    this.repository.close();
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) {
        await this.handleChatCommand(interaction);
        return;
      }
      if (interaction.isButton()) {
        await this.handleButton(interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        await this.handleModal(interaction);
      }
    } catch (error) {
      await this.respondWithError(interaction, error);
    }
  }

  private async handleChatCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "내전" || interaction.options.getSubcommand() !== "세팅") {
      return;
    }
    this.requireGuild(interaction);
    if (!isAdministrator(interaction)) {
      throw new DomainError("이 명령어는 관리자만 사용할 수 있어요.", "ADMIN_ONLY");
    }
    await interaction.showModal(buildSetupModal());
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = parseCustomId(interaction.customId);
    if (!customId) return;

    switch (customId.action) {
      case "panel-rift":
        await this.handleImmediateRecruitmentButton(interaction, customId.id, "RIFT");
        return;
      case "panel-aram":
        await this.handleImmediateRecruitmentButton(interaction, customId.id, "ARAM");
        return;
      case "panel-reservation": {
        this.requirePanelInteraction(interaction, customId.id);
        if (!isAdministrator(interaction)) {
          throw new DomainError("현재 내전 예약은 관리자만 가능해요.", "ADMIN_ONLY");
        }
        await interaction.showModal(buildReservationModal(customId.id));
        return;
      }
      case "join":
        await this.handleJoin(interaction, customId.id);
        return;
      case "leave":
        await this.handleLeave(interaction, customId.id);
        return;
      case "mention":
        await this.handleMention(interaction, customId.id);
        return;
      case "summon":
        await this.handleSummonRequest(interaction, customId.id);
        return;
      case "delete":
        await this.handleDelete(interaction, customId.id);
        return;
      case "manage":
        throw new DomainError("해당 기능은 아직 준비중이에요.", "NOT_IMPLEMENTED");
      default:
        return;
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = parseCustomId(interaction.customId);
    if (!customId) return;

    switch (customId.action) {
      case "setup":
        await this.handleSetupModal(interaction);
        return;
      case "immediate":
        await this.handleImmediateRecruitmentModal(
          interaction,
          customId.id,
          customId.gameType,
        );
        return;
      case "reservation":
        await this.handleReservationModal(interaction, customId.id);
        return;
      case "summon-confirm":
        await this.handleSummonConfirmation(interaction, customId.id);
        return;
      default:
        return;
    }
  }

  private async handleSetupModal(interaction: ModalSubmitInteraction): Promise<void> {
    const guild = this.requireGuild(interaction);
    if (!isAdministrator(interaction)) {
      throw new DomainError("내전 패널은 관리자만 만들 수 있어요.", "ADMIN_ONLY");
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const categoryId = parseSnowflake(interaction.fields.getTextInputValue("category_id"));
    if (!categoryId) {
      throw new DomainError("올바른 카테고리 ID를 입력해 주세요.", "INVALID_CATEGORY_ID");
    }

    const category = asCategory(await fetchGuildChannel(guild, categoryId));
    if (!category) {
      throw new DomainError(
        "해당 ID의 카테고리를 찾지 못했어요. 일반 채팅 채널 ID가 아닌 카테고리 ID인지 확인해 주세요.",
        "CATEGORY_NOT_FOUND",
      );
    }
    const me = guild.members.me ?? (await guild.members.fetchMe());
    assertBotCanCreateRecruitments(category, me);

    const existing = this.repository.getActivePanelByCategory(guild.id, category.id);
    if (existing?.channelId) {
      const exists = Boolean(await fetchGuildChannel(guild, existing.channelId));
      if (exists) {
        throw new DomainError(
          `이 카테고리에는 이미 내전 모집 패널 <#${existing.channelId}>이 있어요.`,
          "ACTIVE_PANEL_EXISTS",
        );
      }
      this.repository.closePanelByChannel(existing.channelId, Date.now());
    }

    const panel = this.repository.claimPanel({
      guildId: guild.id,
      categoryId: category.id,
      creatorId: interaction.user.id,
      now: Date.now(),
    });

    let channel: TextChannel | null = null;
    try {
      channel = await guild.channels.create({
        name: PANEL_CHANNEL_NAME,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `${interaction.user.tag}님의 /내전 세팅`,
      });
      const message = await channel.send(buildPanelMessagePayload(panel));
      this.repository.activatePanel(panel.id, channel.id, message.id);
    } catch (error) {
      this.repository.abandonPanel(panel.id, Date.now());
      if (channel) await channel.delete("내전 패널 생성 실패 정리").catch(() => undefined);
      throw error;
    }

    await interaction.editReply(`내전 모집 패널을 만들었어요: <#${channel.id}>`);
  }

  private async handleImmediateRecruitmentButton(
    interaction: ButtonInteraction,
    panelId: number,
    gameType: GameType,
  ): Promise<void> {
    this.requirePanelInteraction(interaction, panelId);
    await interaction.showModal(buildImmediateRecruitmentModal(panelId, gameType));
  }

  private async handleImmediateRecruitmentModal(
    interaction: ModalSubmitInteraction,
    panelId: number,
    gameType: GameType,
  ): Promise<void> {
    const panel = this.requirePanelInteraction(interaction, panelId);
    const selectedDelay = interaction.fields.getStringSelectValues("start_delay")[0];
    const delayMinutes = parseImmediateStartDelay(selectedDelay);
    if (selectedDelay && delayMinutes === null) {
      throw new DomainError(
        "시작 시간은 제공된 분 단위 옵션에서 선택해 주세요.",
        "INVALID_START_DELAY",
      );
    }
    const description = interaction.fields.getTextInputValue("description").trim();
    const now = Date.now();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await this.createRecruitment(interaction, panel, {
      panelId: panel.id,
      guildId: panel.guildId,
      categoryId: panel.categoryId,
      creatorId: interaction.user.id,
      kind: gameType === "RIFT" ? "RIFT_NOW" : "ARAM_NOW",
      gameType,
      description: description || null,
      scheduledAt: scheduledAtFromDelay(now, delayMinutes),
      now,
    });
  }

  private async handleReservationModal(
    interaction: ModalSubmitInteraction,
    panelId: number,
  ): Promise<void> {
    const panel = this.requirePanelInteraction(interaction, panelId);
    if (!isAdministrator(interaction)) {
      throw new DomainError("현재 내전 예약은 관리자만 가능해요", "ADMIN_ONLY");
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const selectedGameType = interaction.fields.getStringSelectValues("game_type")[0];
    if (selectedGameType !== "RIFT" && selectedGameType !== "ARAM") {
      throw new DomainError("협곡 또는 아람을 선택해 주세요.", "INVALID_GAME_TYPE");
    }
    const gameType: GameType = selectedGameType;
    const selectedTimezone = interaction.fields.getStringSelectValues("timezone")[0];
    if (!selectedTimezone) {
      throw new DomainError("타임존을 선택해 주세요.", "INVALID_TIMEZONE");
    }
    const parsedTime = parseReservationTime(
      interaction.fields.getTextInputValue("date"),
      interaction.fields.getTextInputValue("time"),
      selectedTimezone,
    );
    const description = interaction.fields.getTextInputValue("description").trim();

    await this.createRecruitment(interaction, panel, {
      panelId: panel.id,
      guildId: panel.guildId,
      categoryId: panel.categoryId,
      creatorId: interaction.user.id,
      kind: "RESERVATION",
      gameType,
      description: description || null,
      scheduledAt: parsedTime.scheduledAt,
      timezoneInput: parsedTime.timezoneLabel,
      now: Date.now(),
    });
  }

  private async createRecruitment(
    interaction: RecruitmentInteraction,
    panel: Panel,
    input: ClaimRecruitmentInput,
  ): Promise<void> {
    const guild = this.requireGuild(interaction);
    const category = asCategory(await fetchGuildChannel(guild, panel.categoryId));
    if (!category) {
      throw new DomainError("모집 패널의 카테고리가 없어졌어요.", "CATEGORY_NOT_FOUND");
    }
    const me = guild.members.me ?? (await guild.members.fetchMe());
    assertBotCanCreateRecruitments(category, me);

    const recruitment = this.repository.claimRecruitment(input);
    let channel: TextChannel | null = null;
    try {
      channel = await guild.channels.create({
        name: buildRecruitmentChannelName(recruitment),
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `CR 내전 모집 #${recruitment.id} • 생성자 ${interaction.user.tag}`,
        reason: `${interaction.user.tag}님의 내전 모집`,
        permissionOverwrites: buildRecruitmentPermissionOverwrites(
          category.permissionOverwrites.cache.values(),
          guild.roles.everyone.id,
          me.id,
        ),
      });
      const message = await channel.send(
        buildRecruitmentMessagePayload(recruitment, [], this.config),
      );
      await message.startThread({
        name: RECRUITMENT_THREAD_NAME,
        reason: `${interaction.user.tag}님의 내전 모집 대화 쓰레드`,
      });
      this.repository.activateRecruitment(recruitment.id, channel.id, message.id);
      void message.pin("내전 모집 대기열").catch(() => undefined);
    } catch (error) {
      this.repository.abandonRecruitment(recruitment.id, Date.now());
      if (channel) await channel.delete("내전 모집 생성 실패 정리").catch(() => undefined);
      throw error;
    }

    await interaction.editReply(`내전 대기열이 성공적으로 생성되었어요!: <#${channel.id}>`);
  }

  private async handleJoin(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    const guild = this.requireGuild(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await guild.members.fetch(interaction.user.id);
    const result = this.repository.addQueueMember(
      recruitment.id,
      interaction.user.id,
      member.displayName,
      Date.now(),
    );
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    const positionMessage = formatQueuePosition(
      result.position,
      this.config.callSize,
      this.config.queueCapacity,
    );
    await interaction.editReply(`참가 완료! ${positionMessage}${refreshWarning}`);
  }

  private async handleLeave(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    this.repository.removeQueueMember(recruitment.id, interaction.user.id);
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    await interaction.editReply(`이걸 쫄튀하네 ㅋ.${refreshWarning}`);
  }

  private async handleMention(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length === 0) {
      throw new DomainError(
        "대기열에 멘션할 참가자가 없어요.",
        "NOT_ENOUGH_MEMBERS",
      );
    }
    const cooldown = this.repository.tryAcquireCooldown(
      recruitment.guildId,
      ALL_MENTION_COOLDOWN_KEY,
      Date.now(),
      this.config.mentionCooldownMs,
    );
    if (!cooldown.acquired) {
      throw new DomainError(
        `서버 올 멘션 쿨타임이에요. 약 ${Math.ceil(cooldown.remainingMs / 1_000)}초 뒤에 다시 시도해 주세요.`,
        "MENTION_COOLDOWN",
      );
    }

    const targetIds = firstQueueMemberIds(members, this.config.callSize);
    await interaction.reply({
      content: `📣 **내전 인원 소환!**\n${targetIds.map((id) => `<@${id}>`).join(" ")}`,
      allowedMentions: { parse: [], users: targetIds },
    });
    const deleteTimer = setTimeout(() => {
      void interaction.deleteReply().catch(() => undefined);
    }, MENTION_MESSAGE_LIFETIME_MS);
    deleteTimer.unref();
  }

  private async handleSummonRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireCreatorOrAdministrator(interaction, recruitment, "올 소환");
    if (recruitment.summonState !== "AVAILABLE") {
      throw new DomainError("올 소환은 이 모집에서 이미 사용됐어요.", "SUMMON_ALREADY_USED");
    }
    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length === 0) {
      throw new DomainError("대기열에 소환할 참가자가 없어요.", "NOT_ENOUGH_MEMBERS");
    }

    const guild = this.requireGuild(interaction);
    await this.requireSummonVoiceChannel(guild);
    await interaction.showModal(buildSummonModal(recruitment.id));
  }

  private async handleSummonConfirmation(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId, false);
    this.requireCreatorOrAdministrator(interaction, recruitment, "올 소환");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (
      interaction.fields.getTextInputValue("confirmation").trim() !==
      SUMMON_CONFIRMATION_TEXT
    ) {
      throw new DomainError(
        `확인란에 정확히 "${SUMMON_CONFIRMATION_TEXT}"이라고 입력해야 해요.`,
        "INVALID_CONFIRMATION",
      );
    }
    const guild = this.requireGuild(interaction);
    const target = await this.requireSummonVoiceChannel(guild);
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const missingPermissions = target.permissionsFor(me).missing([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
    ]);
    if (missingPermissions.length > 0) {
      throw new DomainError(
        `봇의 음성 채널 권한이 부족해요: ${missingPermissions.join(", ")}`,
        "MISSING_VOICE_PERMISSIONS",
      );
    }

    const queue = this.repository.listQueueMembers(recruitment.id);
    if (queue.length === 0) {
      throw new DomainError("대기열에 소환할 참가자가 없어요.", "NOT_ENOUGH_MEMBERS");
    }
    if (!this.repository.tryClaimSummon(recruitment.id)) {
      throw new DomainError("올 소환이 이미 사용됐거나 현재 처리 중이에요.", "SUMMON_ALREADY_USED");
    }

    let summonResult: VoiceSummonResult;
    try {
      summonResult = await moveQueueMembersToVoiceChannel({
        guild,
        target,
        members: queue,
        limit: this.config.callSize,
        reason: `내전 모집 #${recruitment.id} 올 소환`,
      });
      if (summonResult.movedIds.length > 0) {
        this.repository.completeSummon(recruitment.id);
      } else {
        this.repository.releaseSummonClaim(recruitment.id);
      }
    } catch (error) {
      this.repository.releaseSummonClaim(recruitment.id);
      throw error;
    }

    const moved = summonResult.movedIds.length;
    const refreshWarning =
      moved > 0
        ? await this.stateService.tryRefreshRecruitmentMessage(recruitment.id)
        : "";
    let logWarning = "";
    if (summonResult.movedIds.length > 0 && recruitment.channelId) {
      try {
        const recruitmentChannel = await this.client.channels.fetch(recruitment.channelId);
        if (!recruitmentChannel || recruitmentChannel.type !== ChannelType.GuildText) {
          throw new Error("모집 채널을 찾지 못했습니다.");
        }
        await recruitmentChannel.send({
          content: `🔊 <@${interaction.user.id}>님이 **올 소환** 버튼으로 다음 인원을 <#${target.id}> 채널로 이동시켰어요.\n${summonResult.movedIds
            .map((id) => `<@${id}>`)
            .join(" ")}`,
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        console.error(`올 소환 기록 전송 실패 (#${recruitment.id})`, error);
        logWarning = "\n⚠️ 음성 이동은 완료됐지만 채널에 소환 기록을 남기지 못했어요.";
      }
    }
    const usageMessage =
      moved > 0
        ? "올 소환 사용을 완료했어요."
        : "실제로 이동한 사람이 없어 사용 횟수는 소모하지 않았어요.";
    await interaction.editReply(
      `${usageMessage}\n이동 **${moved}명** · 미접속 **${summonResult.notConnected}명** · 이미 대상 방 **${summonResult.alreadyThere}명** · 실패 **${summonResult.failed}명**${refreshWarning}${logWarning}`,
    );
  }

  private async handleDelete(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireCreatorOrAdministrator(interaction, recruitment, "삭제");
    const guild = this.requireGuild(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = recruitment.channelId
      ? await fetchGuildChannel(guild, recruitment.channelId)
      : null;
    if (!channel || channel.type !== ChannelType.GuildText) {
      this.repository.closeRecruitment(recruitment.id, Date.now());
      throw new DomainError("채널이 이미 삭제되어 모집 기록만 정리했어요.", "CHANNEL_ALREADY_DELETED");
    }

    await interaction.editReply("모집 채널을 삭제합니다.");
    await channel.delete(`${interaction.user.tag}님의 내전 모집 삭제`);
    this.repository.closeRecruitment(recruitment.id, Date.now());
  }

  private requirePanelInteraction(interaction: RecruitmentInteraction, panelId: number): Panel {
    const guild = this.requireGuild(interaction);
    const panel = this.repository.getPanel(panelId);
    if (
      !panel ||
      panel.status !== "ACTIVE" ||
      panel.guildId !== guild.id ||
      panel.channelId !== interaction.channelId
    ) {
      throw new DomainError("이 내전 모집 패널은 더 이상 유효하지 않아요.", "INVALID_PANEL");
    }
    return panel;
  }

  private requireRecruitmentInteraction(
    interaction: RecruitmentInteraction,
    recruitmentId: number,
    requireSameChannel = true,
  ): Recruitment {
    const guild = this.requireGuild(interaction);
    const recruitment = this.repository.getRecruitment(recruitmentId);
    if (
      !recruitment ||
      recruitment.status !== "OPEN" ||
      recruitment.guildId !== guild.id ||
      (requireSameChannel && recruitment.channelId !== interaction.channelId)
    ) {
      throw new DomainError("이 내전 모집은 더 이상 유효하지 않아요.", "INVALID_RECRUITMENT");
    }
    return recruitment;
  }

  private requireCreatorOrAdministrator(
    interaction: RecruitmentInteraction,
    recruitment: Recruitment,
    actionName: string,
  ): void {
    if (interaction.user.id !== recruitment.creatorId && !isAdministrator(interaction)) {
      throw new DomainError(
        `${actionName} 기능은 모집 생성자 또는 관리자만 사용할 수 있어요.`,
        "CREATOR_OR_ADMIN_ONLY",
      );
    }
  }

  private requireGuild<T extends Interaction>(interaction: T): Guild {
    if (!interaction.guild || !interaction.guildId) {
      throw new DomainError("서버 안에서만 사용할 수 있는 기능이에요.", "GUILD_ONLY");
    }
    return interaction.guild;
  }

  private async requireSummonVoiceChannel(guild: Guild): Promise<VoiceChannel> {
    const channel = await fetchGuildChannel(guild, SUMMON_VOICE_CHANNEL_ID);
    if (channel?.type !== ChannelType.GuildVoice) {
      throw new DomainError(
        `설정된 소환 음성 채널(<#${SUMMON_VOICE_CHANNEL_ID}>)을 찾지 못했어요.`,
        "VOICE_CHANNEL_NOT_FOUND",
      );
    }
    return channel;
  }

  private async respondWithError(interaction: Interaction, error: unknown): Promise<void> {
    const isExpected = error instanceof DomainError || error instanceof ReservationTimeError;
    if (!isExpected) console.error("상호작용 처리 실패", error);
    const message = isExpected
      ? error.message
      : "처리 중 오류가 발생했어요. 봇 권한과 로그를 확인한 뒤 다시 시도해 주세요.";

    if (!interaction.isRepliable()) return;
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: `❌ ${message}` });
      } else if (interaction.replied) {
        await interaction.followUp({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `❌ ${message}`, flags: MessageFlags.Ephemeral });
      }
    } catch (responseError) {
      console.error("오류 응답 전송 실패", responseError);
    }
  }
}
