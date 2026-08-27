import type { GameType } from "../domain/models.js";

const PREFIX = "crq";

export const customIds = {
  setupModal: `${PREFIX}:setup`,
  panelRift: (panelId: number) => `${PREFIX}:panel:rift:${panelId}`,
  panelAram: (panelId: number) => `${PREFIX}:panel:aram:${panelId}`,
  panelReservation: (panelId: number) => `${PREFIX}:panel:reservation:${panelId}`,
  immediateModal: (panelId: number, gameType: GameType) =>
    `${PREFIX}:immediate:${gameType.toLowerCase()}:${panelId}`,
  reservationModal: (panelId: number) => `${PREFIX}:reservation:${panelId}`,
  join: (recruitmentId: number) => `${PREFIX}:join:${recruitmentId}`,
  leave: (recruitmentId: number) => `${PREFIX}:leave:${recruitmentId}`,
  mention: (recruitmentId: number) => `${PREFIX}:mention:${recruitmentId}`,
  summon: (recruitmentId: number) => `${PREFIX}:summon:${recruitmentId}`,
  summonModal: (recruitmentId: number) => `${PREFIX}:summon-confirm:${recruitmentId}`,
  delete: (recruitmentId: number) => `${PREFIX}:delete:${recruitmentId}`,
  manage: (recruitmentId: number) => `${PREFIX}:manage:${recruitmentId}`,
} as const;

export type ParsedCustomId =
  | { action: "setup" }
  | { action: "panel-rift" | "panel-aram" | "panel-reservation"; id: number }
  | { action: "immediate"; id: number; gameType: GameType }
  | { action: "reservation"; id: number }
  | {
      action: "join" | "leave" | "mention" | "summon" | "delete" | "manage";
      id: number;
    }
  | { action: "summon-confirm"; id: number };

export function parseCustomId(value: string): ParsedCustomId | null {
  const parts = value.split(":");
  if (parts[0] !== PREFIX) return null;
  if (parts.length === 2 && parts[1] === "setup") return { action: "setup" };

  const id = Number(parts.at(-1));
  if (parts[1] === "panel" && Number.isSafeInteger(id) && id > 0) {
    if (parts[2] === "rift") return { action: "panel-rift", id };
    if (parts[2] === "aram") return { action: "panel-aram", id };
    if (parts[2] === "reservation") return { action: "panel-reservation", id };
  }
  if (parts[1] === "reservation" && Number.isSafeInteger(id) && id > 0) {
    return { action: "reservation", id };
  }
  if (
    parts[1] === "immediate" &&
    parts.length === 4 &&
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    if (parts[2] === "rift") return { action: "immediate", id, gameType: "RIFT" };
    if (parts[2] === "aram") return { action: "immediate", id, gameType: "ARAM" };
  }
  if (
    parts[1] === "summon-confirm" &&
    parts.length === 3 &&
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    return { action: "summon-confirm", id };
  }

  const actions = ["join", "leave", "mention", "summon", "delete", "manage"] as const;
  if (
    parts.length === 3 &&
    actions.includes(parts[1] as (typeof actions)[number]) &&
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    return { action: parts[1] as (typeof actions)[number], id };
  }
  return null;
}
