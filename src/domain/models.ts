export const GAME_TYPES = ["RIFT", "ARAM"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const RECRUITMENT_KINDS = [
  "RIFT_NOW",
  "ARAM_NOW",
  "RESERVATION",
] as const;
export type RecruitmentKind = (typeof RECRUITMENT_KINDS)[number];

export type PanelStatus = "CREATING" | "ACTIVE" | "CLOSED";
export type RecruitmentStatus = "CREATING" | "OPEN" | "CLOSED";
export type RegistrationState = "OPEN" | "CLOSED";
export type SummonState = "AVAILABLE" | "CLAIMED" | "USED";

export interface Panel {
  id: number;
  guildId: string;
  categoryId: string;
  channelId: string | null;
  messageId: string | null;
  creatorId: string;
  status: PanelStatus;
  createdAt: number;
}

export interface Recruitment {
  id: number;
  panelId: number;
  guildId: string;
  categoryId: string;
  channelId: string | null;
  messageId: string | null;
  creatorId: string;
  kind: RecruitmentKind;
  gameType: GameType;
  channelNumber: number | null;
  description: string | null;
  scheduledAt: number | null;
  timezoneInput: string | null;
  status: RecruitmentStatus;
  registrationState: RegistrationState;
  summonState: SummonState;
  createdAt: number;
  closedAt: number | null;
}

export interface QueueMember {
  sequence: number;
  recruitmentId: number;
  userId: string;
  displayName: string;
  riotName: string | null;
  riotTag: string | null;
  joinedAt: number;
}

export interface AddQueueMemberInput {
  recruitmentId: number;
  userId: string;
  displayName: string;
  riotName: string;
  riotTag: string;
  now: number;
  capacity: number;
}

export interface ClaimPanelInput {
  guildId: string;
  categoryId: string;
  creatorId: string;
  now: number;
}

export interface ClaimRecruitmentInput {
  panelId: number;
  guildId: string;
  categoryId: string;
  creatorId: string;
  kind: RecruitmentKind;
  gameType: GameType;
  description?: string | null;
  scheduledAt?: number | null;
  timezoneInput?: string | null;
  now: number;
}

export interface QueueMutationResult {
  position: number;
  members: QueueMember[];
}

export interface CooldownResult {
  acquired: boolean;
  remainingMs: number;
}
