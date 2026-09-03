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
  type StringSelectMenuInteraction,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";
import type {
  ClaimRecruitmentInput,
  GameType,
  Panel,
  QueueMember,
  Recruitment,
} from "../domain/models.js";
import type { RecruitmentRepository } from "../db/repository.js";
import { buildRecruitmentChannelName } from "../services/channelNames.js";
import {
  firstQueueMemberIds,
  formatQueuePosition,
  resolveSummonTargetLimit,
} from "../services/queuePresentation.js";
import {
  parseOptionalReservationTime,
  ReservationTimeError,
} from "../services/reservationTime.js";
import { parseRiotId } from "../services/riotId.js";
import type { TeamBuilderService } from "../services/teamBuilder.js";
import {
  buildDeleteConfirmationButtons,
  buildImmediateRecruitmentModal,
  buildJoinModal,
  buildManualAddModal,
  buildManualRemoveRows,
  buildSetupModal,
  buildSummonModal,
} from "./components.js";
import {
  ALL_MENTION_COOLDOWN_KEY,
  INHOUSE_MANAGER_ROLE_ID,
  INHOUSE_ROLE_ID,
  MENTION_MESSAGE_LIFETIME_MS,
  NEW_MEMBER_ROLE_ID,
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
  canManuallyManageQueue,
  canManageRecruitment,
  hasUnlimitedSummonPermission,
  interactionHasAnyRole,
  interactionHasRole,
  isAdministrator,
  isInhouseRoleActionAllowed,
  parseSnowflake,
} from "./helpers.js";
import {
  buildInitialRecruitmentMessagePayload,
  buildPanelMessagePayload,
} from "./messagePayloads.js";
import {
  moveQueueMembersToVoiceChannel,
  type VoiceSummonResult,
} from "./voiceSummon.js";

type RecruitmentInteraction =
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

export class BotController {
  readonly client: Client;
  private readonly stateService: DiscordStateService;

  constructor(
    private readonly repository: RecruitmentRepository,
    private readonly config: AppConfig,
    private readonly teamBuilderService: TeamBuilderService,
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
        return;
      }
      if (interaction.isStringSelectMenu()) {
        await this.handleStringSelect(interaction);
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
    this.requireInhouseRoleActionAccess(interaction);
    if (!isAdministrator(interaction)) {
      throw new DomainError("이 명령어는 관리자만 사용할 수 있어요.", "ADMIN_ONLY");
    }
    await interaction.showModal(buildSetupModal());
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    const customId = parseCustomId(interaction.customId);
    if (!customId) return;
    if (!isInhouseRoleActionAllowed(customId.action)) {
      this.requireInhouseRoleActionAccess(interaction);
    }

    switch (customId.action) {
      case "panel-rift":
        await this.handleImmediateRecruitmentButton(interaction, customId.id, "RIFT");
        return;
      case "panel-aram":
        await this.handleImmediateRecruitmentButton(interaction, customId.id, "ARAM");
        return;
      case "panel-reservation": {
        throw new DomainError(
          "내전 예약은 협곡 또는 아람 모집 버튼에서 날짜·시간·타임존을 입력해 만들 수 있어요.",
          "RESERVATION_MOVED",
        );
      }
      case "join":
        await this.handleJoinRequest(interaction, customId.id);
        return;
      case "leave":
        await this.handleLeave(interaction, customId.id);
        return;
      case "close":
        await this.handleRegistrationToggle(interaction, customId.id);
        return;
      case "teams":
        await this.handleTeamFormation(interaction, customId.id);
        return;
      case "manual-add":
        await this.handleManualAddRequest(interaction, customId.id);
        return;
      case "manual-remove":
        await this.handleManualRemoveRequest(interaction, customId.id);
        return;
      case "mention":
        await this.handleMention(interaction, customId.id);
        return;
      case "summon":
        await this.handleSummonRequest(interaction, customId.id);
        return;
      case "delete":
        await this.handleDeleteRequest(interaction, customId.id);
        return;
      case "delete-confirm":
        await this.handleDeleteConfirmation(interaction, customId.id);
        return;
      case "delete-cancel":
        await this.handleDeleteCancellation(interaction, customId.id);
        return;
      case "manage":
        throw new DomainError("이전 관리 버튼은 더 이상 사용하지 않아요.", "MOVED_FEATURE");
      default:
        return;
    }
  }

  private async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = parseCustomId(interaction.customId);
    if (!customId) return;
    if (!isInhouseRoleActionAllowed(customId.action)) {
      this.requireInhouseRoleActionAccess(interaction);
    }

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
      case "join-submit":
        await this.handleJoinModal(interaction, customId.id);
        return;
      case "manual-add-submit":
        await this.handleManualAdd(interaction, customId.id);
        return;
      case "reservation":
        throw new DomainError(
          "이전 예약 모달은 만료됐어요. 협곡 또는 아람 모집 버튼을 다시 눌러 주세요.",
          "RESERVATION_MOVED",
        );
      case "summon-confirm":
        await this.handleSummonConfirmation(interaction, customId.id);
        return;
      default:
        return;
    }
  }

  private async handleStringSelect(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    const customId = parseCustomId(interaction.customId);
    if (!customId || customId.action !== "manual-remove-select") return;
    await this.handleManualRemove(interaction, customId.id);
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
    const selectedTimezone = interaction.fields.getStringSelectValues("timezone")[0] ?? "";
    const reservation = parseOptionalReservationTime(
      interaction.fields.getTextInputValue("date"),
      interaction.fields.getTextInputValue("time"),
      selectedTimezone,
    );
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
      scheduledAt: reservation?.scheduledAt ?? null,
      timezoneInput: reservation?.timezoneLabel ?? null,
      now,
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
        buildInitialRecruitmentMessagePayload(recruitment, [], this.config),
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

  private async handleJoinRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireOpenRegistration(recruitment);
    if (
      interactionHasAnyRole(interaction, [INHOUSE_ROLE_ID, NEW_MEMBER_ROLE_ID])
    ) {
      await interaction.showModal(buildJoinModal(recruitment.id));
      return;
    }
    await this.completeQueueJoin(interaction, recruitment, null, null);
  }

  private async handleJoinModal(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireOpenRegistration(recruitment);
    const riotId = parseRiotId(
      interaction.fields.getTextInputValue("riot_name"),
      interaction.fields.getTextInputValue("riot_tag"),
    );
    await this.completeQueueJoin(
      interaction,
      recruitment,
      riotId.name,
      riotId.tag,
    );
  }

  private async completeQueueJoin(
    interaction: RecruitmentInteraction,
    recruitment: Recruitment,
    riotName: string | null,
    riotTag: string | null,
  ): Promise<void> {
    const guild = this.requireGuild(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await guild.members.fetch(interaction.user.id);
    const result = this.repository.addQueueMember({
      recruitmentId: recruitment.id,
      userId: interaction.user.id,
      displayName: member.displayName,
      riotName,
      riotTag,
      now: Date.now(),
      capacity: this.config.queueCapacity,
    });
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    const positionMessage = formatQueuePosition(
      result.position,
      this.config.callSize,
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

  private async handleRegistrationToggle(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "마감/재오픈");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const updated = this.repository.toggleRegistration(recruitment.id);
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    const resultMessage =
      updated.registrationState === "CLOSED"
        ? "참가 신청을 마감했어요."
        : "참가 신청을 다시 열었어요.";
    await interaction.editReply(`${resultMessage}${refreshWarning}`);
  }

  private async handleTeamFormation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "팀 짜기");
    if (recruitment.registrationState !== "CLOSED") {
      throw new DomainError("먼저 참가 신청을 마감해 주세요.", "REGISTRATION_STILL_OPEN");
    }

    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length < 1) {
      throw new DomainError(
        "팀을 짜려면 참가자가 최소 1명 필요해요.",
        "NOT_ENOUGH_MEMBERS",
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.teamBuilderService.createLink(recruitment, members);
    const excludedMessage =
      result.excludedCount > 0
        ? ` · 후순위 제외 ${result.excludedCount}명`
        : "";
    await interaction.editReply({
      content: [
        "⚔️ **웹 팀 편성판을 준비했어요.**",
        `[드래그 팀 편성판 열기](${result.url})`,
        `선착순 ${result.selectedCount}명${excludedMessage} · 랭크 ${result.rankedCount}명 · 언랭 ${result.unrankedCount}명 · 미조회 ${result.unavailableCount}명`,
        `링크는 <t:${Math.floor(result.expiresAt / 1_000)}:R> 만료돼요.`,
      ].join("\n"),
      allowedMentions: { parse: [] },
    });
  }

  private async handleManualAddRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(interaction, recruitment, "수동 추가");
    await interaction.showModal(buildManualAddModal(recruitment.id));
  }

  private async handleManualAdd(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(interaction, recruitment, "수동 추가");
    const selectedUser = interaction.fields
      .getSelectedUsers("manual_member", true)
      .first();
    if (!selectedUser) {
      throw new DomainError("추가할 서버 멤버를 선택해 주세요.", "MEMBER_NOT_SELECTED");
    }
    if (selectedUser.bot) {
      throw new DomainError("봇 계정은 대기열에 추가할 수 없어요.", "BOT_NOT_ALLOWED");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = this.requireGuild(interaction);
    const member = await guild.members.fetch(selectedUser.id).catch(() => null);
    if (!member) {
      throw new DomainError(
        "선택한 사용자를 이 서버에서 찾지 못했어요.",
        "GUILD_MEMBER_NOT_FOUND",
      );
    }

    const result = this.repository.addQueueMember(
      {
        recruitmentId: recruitment.id,
        userId: member.id,
        displayName: member.displayName,
        riotName: null,
        riotTag: null,
        now: Date.now(),
        capacity: this.config.queueCapacity,
      },
      { allowClosedRegistration: true },
    );
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    await interaction.editReply({
      content: `<@${member.id}>님을 대기열 **${result.position}번째**로 수동 추가했어요.${refreshWarning}`,
      allowedMentions: { parse: [] },
    });
  }

  private async handleManualRemoveRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(interaction, recruitment, "수동 제외");
    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length === 0) {
      throw new DomainError("대기열에서 제외할 참가자가 없어요.", "NOT_ENOUGH_MEMBERS");
    }

    await interaction.reply({
      content: "대기열에서 제외할 참가자를 선택해 주세요.",
      components: buildManualRemoveRows(recruitment.id, members),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  private async handleManualRemove(
    interaction: StringSelectMenuInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(interaction, recruitment, "수동 제외");
    const userId = interaction.values[0];
    if (!userId) {
      throw new DomainError("제외할 참가자를 선택해 주세요.", "MEMBER_NOT_SELECTED");
    }
    const members = this.repository.listQueueMembers(recruitment.id);
    const position = members.findIndex((member) => member.userId === userId);
    if (position < 0) {
      throw new DomainError(
        "선택한 참가자가 이미 대기열에서 빠졌어요. 수동 제외를 다시 눌러 주세요.",
        "NOT_JOINED",
      );
    }

    await interaction.deferUpdate();
    this.repository.removeQueueMember(recruitment.id, userId, {
      allowClosedRegistration: true,
    });
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    await interaction.editReply({
      content: `대기열 **${position + 1}번째** <@${userId}>님을 수동 제외했어요.${refreshWarning}`,
      components: [],
      allowedMentions: { parse: [] },
    });
  }

  private async handleMention(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "전체 멘션");
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
        `서버 전체 멘션 쿨타임이에요. 약 ${Math.ceil(cooldown.remainingMs / 1_000)}초 뒤에 다시 시도해 주세요.`,
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
    this.requireRecruitmentOperator(interaction, recruitment, "전체 소환");
    const unlimited = this.hasUnlimitedSummonAccess(interaction);
    if (!unlimited && recruitment.summonState !== "AVAILABLE") {
      throw new DomainError("올 소환은 이 모집에서 이미 사용됐어요.", "SUMMON_ALREADY_USED");
    }
    const members = this.repository.listQueueMembers(recruitment.id);
    this.requireSummonTargetLimit(members.length);

    const guild = this.requireGuild(interaction);
    await this.requireSummonVoiceChannel(guild);
    await interaction.showModal(buildSummonModal(recruitment.id));
  }

  private async handleSummonConfirmation(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "전체 소환");
    const unlimited = this.hasUnlimitedSummonAccess(interaction);
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
    const summonLimit = this.requireSummonTargetLimit(queue.length);
    if (!unlimited && !this.repository.tryClaimSummon(recruitment.id)) {
      throw new DomainError("올 소환이 이미 사용됐거나 현재 처리 중이에요.", "SUMMON_ALREADY_USED");
    }

    let summonResult: VoiceSummonResult;
    try {
      summonResult = await moveQueueMembersToVoiceChannel({
        guild,
        target,
        members: queue,
        limit: summonLimit,
        reason: `내전 모집 #${recruitment.id} 올 소환`,
      });
      if (!unlimited) {
        if (summonResult.movedIds.length > 0) {
          this.repository.completeSummon(recruitment.id);
        } else {
          this.repository.releaseSummonClaim(recruitment.id);
        }
      }
    } catch (error) {
      if (!unlimited) this.repository.releaseSummonClaim(recruitment.id);
      throw error;
    }

    const moved = summonResult.movedIds.length;
    const refreshWarning =
      moved > 0 && !unlimited
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
    const usageMessage = unlimited
      ? "운영자 권한으로 횟수 제한 없이 올 소환을 실행했어요."
      : moved > 0
        ? "올 소환 사용을 완료했어요."
        : "실제로 이동한 사람이 없어 사용 횟수는 소모하지 않았어요.";
    await interaction.editReply(
      `${usageMessage}\n이동 **${moved}명** · 미접속 **${summonResult.notConnected}명** · 이미 대상 방 **${summonResult.alreadyThere}명** · 실패 **${summonResult.failed}명**${refreshWarning}${logWarning}`,
    );
  }

  private async handleDeleteRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "삭제");
    await interaction.reply({
      content: "⚠️ 정말 이 모집 채널과 대기열을 삭제할까요? 삭제하면 되돌릴 수 없어요.",
      components: buildDeleteConfirmationButtons(recruitment.id),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleDeleteCancellation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "삭제 취소");
    await interaction.update({
      content: "삭제를 취소했어요.",
      components: [],
    });
  }

  private async handleDeleteConfirmation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(interaction, recruitment, "삭제");
    const guild = this.requireGuild(interaction);
    await interaction.deferUpdate();
    const channel = recruitment.channelId
      ? await fetchGuildChannel(guild, recruitment.channelId)
      : null;
    if (!channel || channel.type !== ChannelType.GuildText) {
      this.repository.closeRecruitment(recruitment.id, Date.now());
      throw new DomainError("채널이 이미 삭제되어 모집 기록만 정리했어요.", "CHANNEL_ALREADY_DELETED");
    }

    await interaction.editReply({ content: "모집 채널을 삭제합니다.", components: [] });
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

  private requireRecruitmentOperator(
    interaction: RecruitmentInteraction,
    recruitment: Recruitment,
    actionName: string,
  ): void {
    this.requireInhouseRoleActionAccess(interaction);
    if (
      !canManageRecruitment(
        interaction,
        recruitment.creatorId,
        INHOUSE_MANAGER_ROLE_ID,
        INHOUSE_ROLE_ID,
      )
    ) {
      throw new DomainError(
        `권한이 부족해요. ${actionName} 기능은 모집 생성자, Discord 관리자 또는 내전관리자만 사용할 수 있어요.`,
        "RECRUITMENT_OPERATOR_ONLY",
      );
    }
  }

  private requireOpenRegistration(recruitment: Recruitment): void {
    if (recruitment.registrationState !== "OPEN") {
      throw new DomainError("이 내전은 참가 신청이 마감됐어요.", "REGISTRATION_CLOSED");
    }
  }

  private requireManualQueueOperator(
    interaction: RecruitmentInteraction,
    recruitment: Recruitment,
    actionName: string,
  ): void {
    this.requireInhouseRoleActionAccess(interaction);
    if (
      !canManuallyManageQueue(
        interaction,
        INHOUSE_MANAGER_ROLE_ID,
        INHOUSE_ROLE_ID,
      )
    ) {
      throw new DomainError(
        `권한이 부족해요. ${actionName} 기능은 Discord 관리자 또는 내전관리자만 사용할 수 있어요.`,
        "MANUAL_QUEUE_OPERATOR_ONLY",
      );
    }
  }

  private requireInhouseRoleActionAccess(
    interaction: RecruitmentInteraction | ChatInputCommandInteraction,
  ): void {
    if (interactionHasRole(interaction, INHOUSE_ROLE_ID)) {
      throw new DomainError(
        "권한이 부족해요. 내전 역할 사용자는 신청하기와 쫄튀하기만 사용할 수 있어요.",
        "INHOUSE_ROLE_ACTION_RESTRICTED",
      );
    }
  }

  private hasUnlimitedSummonAccess(interaction: RecruitmentInteraction): boolean {
    return hasUnlimitedSummonPermission(interaction, INHOUSE_MANAGER_ROLE_ID);
  }

  private requireSummonTargetLimit(memberCount: number): number {
    const limit = resolveSummonTargetLimit(
      memberCount,
      this.config.callSize,
    );
    if (limit === 0) {
      throw new DomainError(
        `올 소환은 대기열이 최소 ${this.config.callSize}명 채워졌을 때 사용할 수 있어요. 현재 ${memberCount}명이에요.`,
        "NOT_ENOUGH_MEMBERS",
      );
    }
    return limit;
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
