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
}

export const QUEUE_CAPACITY = 40;

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

export function loadConfig(): AppConfig {
  const databasePath = resolve(process.env.DATABASE_PATH?.trim() || "./data/cr-inhouse.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  return {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    ...(guildId ? { guildId } : {}),
    databasePath,
    queueCapacity: QUEUE_CAPACITY,
    callSize: integer("CALL_SIZE", 10, 2, 10),
    mentionCooldownMs: integer("MENTION_COOLDOWN_SECONDS", 10, 1, 300) * 1_000,
  };
}
