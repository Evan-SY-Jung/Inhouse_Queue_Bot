import "dotenv/config";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export interface AppConfig {
  token: string;
  clientId: string;
  guildId?: string;
  databasePath: string;
  queueCapacity: number;
  callSize: number;
  mentionCooldownMs: number;
  riotApiKey?: string;
  riotRegionalRoute: string;
  riotPlatformRoute: string;
  riotRankCacheMs: number;
  memberRiotTag: string;
  teamBuilderBaseUrl: string;
  teamBuilderSessionTtlMs: number;
}

export const QUEUE_CAPACITY = 40;
export const DEFAULT_TEAM_BUILDER_BASE_URL =
  "https://evan-sy-jung.github.io/Inhouse_Queue_Bot/";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`환경 변수 ${name} 값이 필요합니다.`);
  }
  return value;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} 값은 ${min}~${max} 사이의 정수여야 합니다.`);
  }
  return value;
}

function route(name: string, fallback: string): string {
  const value = process.env[name]?.trim().toLowerCase() || fallback;
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`${name} 값은 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.`);
  }
  return value;
}

function memberRiotTag(): string {
  const value = (process.env.MEMBER_RIOT_TAG?.trim() || "클로버").replace(/^#+/, "");
  if (!value || value.length > 10 || value.includes("#")) {
    throw new Error("MEMBER_RIOT_TAG 값은 # 없이 1~10자로 입력해야 합니다.");
  }
  return value;
}

function teamBuilderBaseUrl(): string {
  const raw = process.env.TEAM_BUILDER_BASE_URL?.trim() || DEFAULT_TEAM_BUILDER_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("TEAM_BUILDER_BASE_URL 값은 올바른 URL이어야 합니다.");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("TEAM_BUILDER_BASE_URL 값은 HTTPS URL이어야 합니다.");
  }
  url.hash = "";
  return url.toString();
}

export function loadConfig(): AppConfig {
  const databasePath = resolve(process.env.DATABASE_PATH?.trim() || "./data/cr-inhouse.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const riotApiKey = process.env.RIOT_API_KEY?.trim();
  return {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    ...(guildId ? { guildId } : {}),
    databasePath,
    queueCapacity: QUEUE_CAPACITY,
    callSize: integer("CALL_SIZE", 10, 2, 10),
    mentionCooldownMs: integer("MENTION_COOLDOWN_SECONDS", 10, 1, 300) * 1_000,
    ...(riotApiKey ? { riotApiKey } : {}),
    riotRegionalRoute: route("RIOT_REGIONAL_ROUTE", "americas"),
    riotPlatformRoute: route("RIOT_PLATFORM_ROUTE", "na1"),
    riotRankCacheMs: integer("RIOT_RANK_CACHE_MINUTES", 15, 1, 1_440) * 60_000,
    memberRiotTag: memberRiotTag(),
    teamBuilderBaseUrl: teamBuilderBaseUrl(),
    teamBuilderSessionTtlMs:
      integer("TEAM_BUILDER_SESSION_MINUTES", 60, 5, 1_440) * 60_000,
  };
}
