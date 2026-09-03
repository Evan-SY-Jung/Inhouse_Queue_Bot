import { ChannelType, type Client, type TextChannel } from "discord.js";
import type { AppConfig } from "../config.js";
import type { RecruitmentRepository } from "../db/repository.js";
import type { Panel, Recruitment } from "../domain/models.js";
import { INTERACTION_MESSAGES } from "../messages/interactionMessages.js";
import {
  buildPanelMessagePayload,
  buildRecruitmentMessagePayload,
} from "../messages/discordMessagePayloads.js";
import { buildRecruitmentChannelName } from "../services/channelNames.js";
import { PANEL_CHANNEL_NAME, RECRUITMENT_THREAD_NAME } from "./constants.js";
import { isUnknownChannel, isUnknownMessage } from "./discordErrors.js";

export class DiscordStateService {
  constructor(
    private readonly client: Client,
    private readonly repository: RecruitmentRepository,
    private readonly config: AppConfig,
  ) {}

  async refreshRecruitmentMessage(recruitmentId: number): Promise<void> {
    const recruitment = this.repository.getRecruitment(recruitmentId);
    if (!recruitment?.channelId || recruitment.status !== "OPEN") {
      throw new Error("갱신할 모집 메시지를 찾지 못했습니다.");
    }
    const channel = await this.client.channels.fetch(recruitment.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error("모집 채널을 찾지 못했습니다.");
    }

    const members = this.repository.listQueueMembers(recruitment.id);
    const payload = buildRecruitmentMessagePayload(recruitment, members, this.config);
    if (!recruitment.messageId) {
      await this.createRecruitmentMessage(channel, recruitment, payload);
      return;
    }

    try {
      const message = await channel.messages.fetch(recruitment.messageId);
      await message.edit(payload);
      if (!message.hasThread) {
        await message.startThread({
          name: RECRUITMENT_THREAD_NAME,
          reason: "내전 모집 대화 쓰레드 복구",
        });
      }
    } catch (error) {
      if (!isUnknownMessage(error)) throw error;
      await this.createRecruitmentMessage(channel, recruitment, payload);
    }
  }

  async tryRefreshRecruitmentMessage(recruitmentId: number): Promise<string> {
    try {
      await this.refreshRecruitmentMessage(recruitmentId);
      return "";
    } catch (error) {
      console.error(`모집 임베드 갱신 실패 (#${recruitmentId})`, error);
      return INTERACTION_MESSAGES.queue.refreshWarning;
    }
  }

  async reconcilePersistentState(): Promise<void> {
    for (const panel of this.repository.listActivePanels()) {
      await this.reconcilePanel(panel);
    }
    for (const recruitment of this.repository.listOpenRecruitments()) {
      await this.reconcileRecruitment(recruitment);
    }
  }

  private async reconcilePanel(panel: Panel): Promise<void> {
    if (!panel.channelId) return;
    try {
      const channel = await this.client.channels.fetch(panel.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        this.repository.closePanelByChannel(panel.channelId, Date.now());
        return;
      }
      if (channel.name !== PANEL_CHANNEL_NAME) {
        await channel.setName(PANEL_CHANNEL_NAME, "내전 만들기 채널 이름 동기화");
      }

      const payload = buildPanelMessagePayload(panel);
      if (!panel.messageId) {
        const replacement = await channel.send(payload);
        this.repository.updatePanelMessage(panel.id, replacement.id);
        return;
      }

      try {
        const message = await channel.messages.fetch(panel.messageId);
        await message.edit(payload);
        if (message.pinned) {
          await message.unpin("내전 모집 코어 패널 고정 해제").catch(() => undefined);
        }
      } catch (error) {
        if (!isUnknownMessage(error)) throw error;
        const replacement = await channel.send(payload);
        this.repository.updatePanelMessage(panel.id, replacement.id);
      }
    } catch (error) {
      if (isUnknownChannel(error)) {
        this.repository.closePanelByChannel(panel.channelId, Date.now());
      } else {
        console.error(`패널 상태 확인 실패 (#${panel.id})`, error);
      }
    }
  }

  private async reconcileRecruitment(recruitment: Recruitment): Promise<void> {
    if (!recruitment.channelId) return;
    try {
      const channel = await this.client.channels.fetch(recruitment.channelId);
      if (!channel || channel.type !== ChannelType.GuildText) {
        this.repository.closeRecruitment(recruitment.id, Date.now());
        return;
      }

      const desiredName = buildRecruitmentChannelName(recruitment);
      if (channel.name !== desiredName) {
        await channel.setName(desiredName, "현재 열린 내전 모집방 번호 동기화");
      }
      await this.refreshRecruitmentMessage(recruitment.id);
    } catch (error) {
      if (isUnknownChannel(error)) {
        this.repository.closeRecruitment(recruitment.id, Date.now());
      } else {
        console.error(`모집 상태 복구 실패 (#${recruitment.id})`, error);
      }
    }
  }

  private async createRecruitmentMessage(
    channel: TextChannel,
    recruitment: Recruitment,
    payload: ReturnType<typeof buildRecruitmentMessagePayload>,
  ): Promise<void> {
    const replacement = await channel.send(payload);
    this.repository.updateRecruitmentMessage(recruitment.id, replacement.id);
    await replacement.startThread({
      name: RECRUITMENT_THREAD_NAME,
      reason: "복구된 내전 모집 대화 쓰레드",
    });
    await replacement.pin("복구된 내전 모집 대기열").catch(() => undefined);
  }
}
