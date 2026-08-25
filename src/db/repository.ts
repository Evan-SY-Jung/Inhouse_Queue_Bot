import type {
  ClaimPanelInput,
  ClaimRecruitmentInput,
  CooldownResult,
  Panel,
  QueueMember,
  QueueMutationResult,
  Recruitment,
} from "../domain/models.js";

export interface RecruitmentRepository {
  claimPanel(input: ClaimPanelInput): Panel;
  activatePanel(panelId: number, channelId: string, messageId: string): Panel;
  abandonPanel(panelId: number, now: number): void;
  getPanel(panelId: number): Panel | null;
  getActivePanelByCategory(guildId: string, categoryId: string): Panel | null;
  listActivePanels(): Panel[];
  updatePanelMessage(panelId: number, messageId: string): void;
  closePanelByChannel(channelId: string, now: number): void;

  claimRecruitment(input: ClaimRecruitmentInput): Recruitment;
  activateRecruitment(
    recruitmentId: number,
    channelId: string,
    messageId: string,
  ): Recruitment;
  abandonRecruitment(recruitmentId: number, now: number): void;
  getRecruitment(recruitmentId: number): Recruitment | null;
  getOpenRecruitmentByChannel(channelId: string): Recruitment | null;
  listOpenRecruitments(): Recruitment[];
  updateRecruitmentMessage(recruitmentId: number, messageId: string): void;
  closeRecruitment(recruitmentId: number, now: number): void;
  closeRecruitmentByChannel(channelId: string, now: number): void;

  listQueueMembers(recruitmentId: number): QueueMember[];
  addQueueMember(
    recruitmentId: number,
    userId: string,
    displayName: string,
    now: number,
  ): QueueMutationResult;
  removeQueueMember(recruitmentId: number, userId: string): QueueMutationResult;

  tryAcquireCooldown(
    guildId: string,
    key: string,
    now: number,
    durationMs: number,
  ): CooldownResult;

  tryClaimSummon(recruitmentId: number): boolean;
  releaseSummonClaim(recruitmentId: number): void;
  completeSummon(recruitmentId: number): void;

  close(): void;
}
