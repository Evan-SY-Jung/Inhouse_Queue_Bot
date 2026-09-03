import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type CategoryChannel,
  type GuildBasedChannel,
  type GuildMember,
  type OverwriteResolvable,
  type PermissionOverwrites,
  type RepliableInteraction,
} from "discord.js";

export function parseSnowflake(value: string): string | null {
  const match = value.trim().match(/^(?:<#)?(\d{17,20})>?$/);
  return match?.[1] ?? null;
}

export function isAdministrator(interaction: RepliableInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

export function interactionHasRole(
  interaction: RepliableInteraction,
  roleId: string,
): boolean {
  const roles = interaction.member?.roles;
  if (!roles) return false;
  return Array.isArray(roles) ? roles.includes(roleId) : roles.cache.has(roleId);
}

export function interactionHasAnyRole(
  interaction: RepliableInteraction,
  roleIds: readonly string[],
): boolean {
  return roleIds.some((roleId) => interactionHasRole(interaction, roleId));
}

export function isInhouseRoleActionAllowed(action: string): boolean {
  return action === "join" || action === "leave" || action === "join-submit";
}

export function hasUnlimitedSummonPermission(
  interaction: RepliableInteraction,
  managerRoleId: string,
): boolean {
  return isAdministrator(interaction) || interactionHasRole(interaction, managerRoleId);
}

export function canManuallyManageQueue(
  interaction: RepliableInteraction,
  managerRoleId: string,
  restrictedRoleId: string,
): boolean {
  if (interactionHasRole(interaction, restrictedRoleId)) return false;
  return hasUnlimitedSummonPermission(interaction, managerRoleId);
}

export function canManageRecruitment(
  interaction: RepliableInteraction,
  creatorId: string,
  managerRoleId: string,
  restrictedRoleId: string,
): boolean {
  if (interactionHasRole(interaction, restrictedRoleId)) return false;
  return (
    interaction.user.id === creatorId ||
    hasUnlimitedSummonPermission(interaction, managerRoleId)
  );
}

export function asCategory(channel: GuildBasedChannel | null): CategoryChannel | null {
  return channel?.type === ChannelType.GuildCategory ? channel : null;
}

export function assertBotCanCreateRecruitments(category: CategoryChannel, me: GuildMember): void {
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
  ];
  const missing = category.permissionsFor(me).missing(required);
  if (missing.length > 0) {
    throw new Error(
      `봇에 필요한 채널 권한이 부족합니다: ${missing.join(", ")}`,
    );
  }
}

export function buildRecruitmentPermissionOverwrites(
  inheritedOverwrites: Iterable<PermissionOverwrites>,
  everyoneRoleId: string,
  botUserId: string,
): OverwriteResolvable[] {
  const overwrites = new Map<
    string,
    { id: string; type?: PermissionOverwrites["type"]; allow: PermissionsBitField; deny: PermissionsBitField }
  >();

  for (const overwrite of inheritedOverwrites) {
    overwrites.set(overwrite.id, {
      id: overwrite.id,
      type: overwrite.type,
      allow: new PermissionsBitField(overwrite.allow.bitfield),
      deny: new PermissionsBitField(overwrite.deny.bitfield),
    });
  }

  for (const overwrite of overwrites.values()) {
    if (overwrite.id === botUserId) continue;
    overwrite.allow.remove(
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
    );
    overwrite.deny.add(
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
    );
    overwrite.deny.remove(PermissionFlagsBits.SendMessagesInThreads);
    overwrite.allow.add(PermissionFlagsBits.SendMessagesInThreads);
  }

  const everyone = overwrites.get(everyoneRoleId) ?? {
    id: everyoneRoleId,
    allow: new PermissionsBitField(),
    deny: new PermissionsBitField(),
  };
  everyone.allow.remove(
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
  );
  everyone.deny.add(
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
  );
  everyone.deny.remove(PermissionFlagsBits.SendMessagesInThreads);
  everyone.allow.add(PermissionFlagsBits.SendMessagesInThreads);
  overwrites.set(everyoneRoleId, everyone);

  const bot = overwrites.get(botUserId) ?? {
    id: botUserId,
    allow: new PermissionsBitField(),
    deny: new PermissionsBitField(),
  };
  const botPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.ManageThreads,
  ];
  bot.deny.remove(botPermissions);
  bot.allow.add(botPermissions);
  overwrites.set(botUserId, bot);

  return [...overwrites.values()];
}
