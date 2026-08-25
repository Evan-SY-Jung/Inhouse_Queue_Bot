import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type Guild,
} from "discord.js";

export function isUnknownChannel(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError &&
    error.code === RESTJSONErrorCodes.UnknownChannel
  );
}

export function isUnknownMessage(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage;
}

export async function fetchGuildChannel(guild: Guild, channelId: string) {
  try {
    return await guild.channels.fetch(channelId);
  } catch (error) {
    if (isUnknownChannel(error)) return null;
    throw error;
  }
}
