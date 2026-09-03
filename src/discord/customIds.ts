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
  joinModal: (recruitmentId: number) => `${PREFIX}:join-submit:${recruitmentId}`,
  leave: (recruitmentId: number) => `${PREFIX}:leave:${recruitmentId}`,
  close: (recruitmentId: number) => `${PREFIX}:close:${recruitmentId}`,
  teams: (recruitmentId: number) => `${PREFIX}:teams:${recruitmentId}`,
  manualAdd: (recruitmentId: number) => `${PREFIX}:manual-add:${recruitmentId}`,
  manualAddModal: (recruitmentId: number) =>
    `${PREFIX}:manual-add-submit:${recruitmentId}`,
  manualRemove: (recruitmentId: number) => `${PREFIX}:manual-remove:${recruitmentId}`,
  manualRemoveModal: (recruitmentId: number) =>
    `${PREFIX}:manual-remove-submit:${recruitmentId}`,
  mention: (recruitmentId: number) => `${PREFIX}:mention:${recruitmentId}`,
  summon: (recruitmentId: number) => `${PREFIX}:summon:${recruitmentId}`,
  summonModal: (recruitmentId: number) => `${PREFIX}:summon-confirm:${recruitmentId}`,
  delete: (recruitmentId: number) => `${PREFIX}:delete:${recruitmentId}`,
  deleteConfirm: (recruitmentId: number) => `${PREFIX}:delete-confirm:${recruitmentId}`,
  deleteCancel: (recruitmentId: number) => `${PREFIX}:delete-cancel:${recruitmentId}`,
  manage: (recruitmentId: number) => `${PREFIX}:manage:${recruitmentId}`,
} as const;

export type ParsedCustomId =
  | { action: "setup" }
  | { action: "panel-rift" | "panel-aram" | "panel-reservation"; id: number }
  | { action: "immediate"; id: number; gameType: GameType }
  | { action: "reservation"; id: number }
  | {
      action: "join" | "leave" | "close" | "teams" | "mention" | "summon" | "delete" | "manage";
      id: number;
    }
  | {
      action:
        | "join-submit"
        | "manual-add"
        | "manual-add-submit"
        | "manual-remove"
        | "manual-remove-submit"
        | "delete-confirm"
        | "delete-cancel";
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
    parts[1] === "join-submit" &&
    parts.length === 3 &&
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    return { action: "join-submit", id };
  }
  if (
    parts[1] === "summon-confirm" &&
    parts.length === 3 &&
    Number.isSafeInteger(id) &&
    id > 0
  ) {
    return { action: "summon-confirm", id };
  }
  const actions = [
    "join",
    "leave",
    "close",
    "teams",
    "mention",
    "summon",
    "delete",
    "delete-confirm",
    "delete-cancel",
    "manual-add",
    "manual-add-submit",
    "manual-remove",
    "manual-remove-submit",
    "manage",
  ] as const;
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
