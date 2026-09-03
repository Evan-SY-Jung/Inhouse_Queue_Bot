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
import {
  buildInitialRecruitmentMessagePayload,
  buildPanelMessagePayload,
} from "../messages/discordMessagePayloads.js";
import {
  INTERACTION_ACTION_NAMES,
  INTERACTION_MESSAGES,
} from "../messages/interactionMessages.js";
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
import { buildDeleteConfirmationButtons } from "./buttons/confirmationButtons.js";
import {
  buildImmediateRecruitmentModal,
  buildJoinModal,
  buildManualAddModal,
  buildManualRemoveModal,
  buildSetupModal,
  buildSummonModal,
} from "./modals/recruitmentModals.js";
import { MODAL_FIELD_IDS } from "./modals/modalFieldIds.js";
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
      throw new DomainError(INTERACTION_MESSAGES.common.commandAdminOnly, "ADMIN_ONLY");
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
          INTERACTION_MESSAGES.legacy.reservationMoved,
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
        throw new DomainError(INTERACTION_MESSAGES.legacy.managementMoved, "MOVED_FEATURE");
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
      case "manual-remove-submit":
        await this.handleManualRemove(interaction, customId.id);
        return;
      case "reservation":
        throw new DomainError(
          INTERACTION_MESSAGES.legacy.reservationModalExpired,
          "RESERVATION_MOVED",
        );
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
      throw new DomainError(INTERACTION_MESSAGES.panel.adminOnly, "ADMIN_ONLY");
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const categoryId = parseSnowflake(
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.categoryId),
    );
    if (!categoryId) {
      throw new DomainError(INTERACTION_MESSAGES.panel.invalidCategoryId, "INVALID_CATEGORY_ID");
    }

    const category = asCategory(await fetchGuildChannel(guild, categoryId));
    if (!category) {
      throw new DomainError(
        INTERACTION_MESSAGES.panel.categoryNotFound,
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
          INTERACTION_MESSAGES.panel.alreadyExists(existing.channelId),
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

    await interaction.editReply(INTERACTION_MESSAGES.panel.created(channel.id));
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
    const selectedTimezone =
      interaction.fields.getStringSelectValues(MODAL_FIELD_IDS.timezone)[0] ?? "";
    const reservation = parseOptionalReservationTime(
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.date),
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.time),
      selectedTimezone,
    );
    const description = interaction.fields
      .getTextInputValue(MODAL_FIELD_IDS.description)
      .trim();
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
      throw new DomainError(
        INTERACTION_MESSAGES.recruitment.categoryMissing,
        "CATEGORY_NOT_FOUND",
      );
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

    await interaction.editReply(INTERACTION_MESSAGES.recruitment.created(channel.id));
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
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.riotName),
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.riotTag),
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
    await interaction.editReply(
      INTERACTION_MESSAGES.queue.joined(positionMessage, refreshWarning),
    );
  }

  private async handleLeave(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    this.repository.removeQueueMember(recruitment.id, interaction.user.id);
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    await interaction.editReply(INTERACTION_MESSAGES.queue.left(refreshWarning));
  }

  private async handleRegistrationToggle(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.registration,
    );
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const updated = this.repository.toggleRegistration(recruitment.id);
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    const resultMessage = INTERACTION_MESSAGES.recruitment.registrationUpdated(
      updated.registrationState === "CLOSED",
      refreshWarning,
    );
    await interaction.editReply(resultMessage);
  }

  private async handleTeamFormation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.teams,
    );
    if (recruitment.registrationState !== "CLOSED") {
      throw new DomainError(
        INTERACTION_MESSAGES.recruitment.registrationStillOpen,
        "REGISTRATION_STILL_OPEN",
      );
    }

    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length < 1) {
      throw new DomainError(
        INTERACTION_MESSAGES.teamBuilder.noMembers,
        "NOT_ENOUGH_MEMBERS",
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.teamBuilderService.createLink(recruitment, members);
    await interaction.editReply({
      content: INTERACTION_MESSAGES.teamBuilder.ready(result),
      allowedMentions: { parse: [] },
    });
  }

  private async handleManualAddRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(
      interaction,
      INTERACTION_ACTION_NAMES.manualAdd,
    );
    await interaction.showModal(buildManualAddModal(recruitment.id));
  }

  private async handleManualAdd(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(
      interaction,
      INTERACTION_ACTION_NAMES.manualAdd,
    );
    const selectedUser = interaction.fields
      .getSelectedUsers(MODAL_FIELD_IDS.manualMember, true)
      .first();
    if (!selectedUser) {
      throw new DomainError(
        INTERACTION_MESSAGES.queue.manualMemberMissing,
        "MEMBER_NOT_SELECTED",
      );
    }
    if (selectedUser.bot) {
      throw new DomainError(INTERACTION_MESSAGES.queue.botNotAllowed, "BOT_NOT_ALLOWED");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = this.requireGuild(interaction);
    const member = await guild.members.fetch(selectedUser.id).catch(() => null);
    if (!member) {
      throw new DomainError(
        INTERACTION_MESSAGES.queue.guildMemberNotFound,
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
      content: INTERACTION_MESSAGES.queue.manuallyAdded(
        member.id,
        result.position,
        refreshWarning,
      ),
      allowedMentions: { parse: [] },
    });
  }

  private async handleManualRemoveRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(
      interaction,
      INTERACTION_ACTION_NAMES.manualRemove,
    );
    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length === 0) {
      throw new DomainError(
        INTERACTION_MESSAGES.queue.noMemberToRemove,
        "NOT_ENOUGH_MEMBERS",
      );
    }

    await interaction.showModal(buildManualRemoveModal(recruitment.id, members));
  }

  private async handleManualRemove(
    interaction: ModalSubmitInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireManualQueueOperator(
      interaction,
      INTERACTION_ACTION_NAMES.manualRemove,
    );
    const selectedUserIds = [0, 1].flatMap((page) => {
      const fieldId = MODAL_FIELD_IDS.manualRemove(page);
      return interaction.fields.fields.has(fieldId)
        ? [...interaction.fields.getStringSelectValues(fieldId)]
        : [];
    });
    if (selectedUserIds.length !== 1) {
      throw new DomainError(
        INTERACTION_MESSAGES.queue.selectOneToRemove,
        "MEMBER_NOT_SELECTED",
      );
    }
    const userId = selectedUserIds[0]!;
    const members = this.repository.listQueueMembers(recruitment.id);
    const position = members.findIndex((member) => member.userId === userId);
    if (position < 0) {
      throw new DomainError(
        INTERACTION_MESSAGES.queue.removalSelectionExpired,
        "NOT_JOINED",
      );
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    this.repository.removeQueueMember(recruitment.id, userId, {
      allowClosedRegistration: true,
    });
    const refreshWarning = await this.stateService.tryRefreshRecruitmentMessage(recruitment.id);
    await interaction.editReply({
      content: INTERACTION_MESSAGES.queue.manuallyRemoved(
        userId,
        position + 1,
        refreshWarning,
      ),
      allowedMentions: { parse: [] },
    });
  }

  private async handleMention(interaction: ButtonInteraction, recruitmentId: number): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.mention,
    );
    const members = this.repository.listQueueMembers(recruitment.id);
    if (members.length === 0) {
      throw new DomainError(
        INTERACTION_MESSAGES.mention.noMembers,
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
        INTERACTION_MESSAGES.mention.cooldown(cooldown.remainingMs),
        "MENTION_COOLDOWN",
      );
    }

    const targetIds = firstQueueMemberIds(members, this.config.callSize);
    await interaction.reply({
      content: INTERACTION_MESSAGES.mention.content(targetIds),
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
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.summon,
    );
    const unlimited = this.hasUnlimitedSummonAccess(interaction);
    if (!unlimited && recruitment.summonState !== "AVAILABLE") {
      throw new DomainError(
        INTERACTION_MESSAGES.summon.alreadyUsed,
        "SUMMON_ALREADY_USED",
      );
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
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.summon,
    );
    const unlimited = this.hasUnlimitedSummonAccess(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (
      interaction.fields.getTextInputValue(MODAL_FIELD_IDS.summonConfirmation).trim() !==
      SUMMON_CONFIRMATION_TEXT
    ) {
      throw new DomainError(
        INTERACTION_MESSAGES.summon.invalidConfirmation(SUMMON_CONFIRMATION_TEXT),
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
        INTERACTION_MESSAGES.summon.missingBotPermissions(missingPermissions),
        "MISSING_VOICE_PERMISSIONS",
      );
    }

    const queue = this.repository.listQueueMembers(recruitment.id);
    const summonLimit = this.requireSummonTargetLimit(queue.length);
    if (!unlimited && !this.repository.tryClaimSummon(recruitment.id)) {
      throw new DomainError(
        INTERACTION_MESSAGES.summon.alreadyProcessing,
        "SUMMON_ALREADY_USED",
      );
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
          content: INTERACTION_MESSAGES.summon.auditLog(
            interaction.user.id,
            target.id,
            summonResult.movedIds,
          ),
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        console.error(`올 소환 기록 전송 실패 (#${recruitment.id})`, error);
        logWarning = INTERACTION_MESSAGES.summon.auditLogWarning;
      }
    }
    await interaction.editReply(
      INTERACTION_MESSAGES.summon.completed({
        unlimited,
        moved,
        notConnected: summonResult.notConnected,
        alreadyThere: summonResult.alreadyThere,
        failed: summonResult.failed,
        refreshWarning,
        logWarning,
      }),
    );
  }

  private async handleDeleteRequest(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.delete,
    );
    await interaction.reply({
      content: INTERACTION_MESSAGES.deletion.confirmation,
      components: buildDeleteConfirmationButtons(recruitment.id),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async handleDeleteCancellation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.deleteCancel,
    );
    await interaction.update({
      content: INTERACTION_MESSAGES.deletion.cancelled,
      components: [],
    });
  }

  private async handleDeleteConfirmation(
    interaction: ButtonInteraction,
    recruitmentId: number,
  ): Promise<void> {
    const recruitment = this.requireRecruitmentInteraction(interaction, recruitmentId);
    this.requireRecruitmentOperator(
      interaction,
      recruitment,
      INTERACTION_ACTION_NAMES.delete,
    );
    const guild = this.requireGuild(interaction);
    await interaction.deferUpdate();
    const channel = recruitment.channelId
      ? await fetchGuildChannel(guild, recruitment.channelId)
      : null;
    if (!channel || channel.type !== ChannelType.GuildText) {
      this.repository.closeRecruitment(recruitment.id, Date.now());
      throw new DomainError(
        INTERACTION_MESSAGES.deletion.channelAlreadyDeleted,
        "CHANNEL_ALREADY_DELETED",
      );
    }

    await interaction.editReply({
      content: INTERACTION_MESSAGES.deletion.deleting,
      components: [],
    });
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
      throw new DomainError(INTERACTION_MESSAGES.panel.invalid, "INVALID_PANEL");
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
      throw new DomainError(
        INTERACTION_MESSAGES.recruitment.invalid,
        "INVALID_RECRUITMENT",
      );
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
        INTERACTION_MESSAGES.recruitment.operatorOnly(actionName),
        "RECRUITMENT_OPERATOR_ONLY",
      );
    }
  }

  private requireOpenRegistration(recruitment: Recruitment): void {
    if (recruitment.registrationState !== "OPEN") {
      throw new DomainError(
        INTERACTION_MESSAGES.recruitment.registrationClosed,
        "REGISTRATION_CLOSED",
      );
    }
  }

  private requireManualQueueOperator(
    interaction: RecruitmentInteraction,
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
        INTERACTION_MESSAGES.recruitment.manualOperatorOnly(actionName),
        "MANUAL_QUEUE_OPERATOR_ONLY",
      );
    }
  }

  private requireInhouseRoleActionAccess(
    interaction: RecruitmentInteraction | ChatInputCommandInteraction,
  ): void {
    if (interactionHasRole(interaction, INHOUSE_ROLE_ID)) {
      throw new DomainError(
        INTERACTION_MESSAGES.recruitment.inhouseRoleRestricted,
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
        INTERACTION_MESSAGES.summon.notEnoughMembers(
          this.config.callSize,
          memberCount,
        ),
        "NOT_ENOUGH_MEMBERS",
      );
    }
    return limit;
  }

  private requireGuild<T extends Interaction>(interaction: T): Guild {
    if (!interaction.guild || !interaction.guildId) {
      throw new DomainError(INTERACTION_MESSAGES.common.guildOnly, "GUILD_ONLY");
    }
    return interaction.guild;
  }

  private async requireSummonVoiceChannel(guild: Guild): Promise<VoiceChannel> {
    const channel = await fetchGuildChannel(guild, SUMMON_VOICE_CHANNEL_ID);
    if (channel?.type !== ChannelType.GuildVoice) {
      throw new DomainError(
        INTERACTION_MESSAGES.summon.voiceChannelNotFound(SUMMON_VOICE_CHANNEL_ID),
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
      : INTERACTION_MESSAGES.common.genericFailure;
    const content = INTERACTION_MESSAGES.common.errorReply(message);

    if (!interaction.isRepliable()) return;
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content });
      } else if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
    } catch (responseError) {
      console.error("오류 응답 전송 실패", responseError);
    }
  }
}
