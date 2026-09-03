/** Discord에 보내는 임베드와 버튼을 하나의 메시지 payload로 조립합니다. */
import type { AppConfig } from "../config.js";
import type { Panel, QueueMember, Recruitment } from "../domain/models.js";
import { buildPanelButtons } from "../discord/buttons/panelButtons.js";
import { buildRecruitmentButtons } from "../discord/buttons/recruitmentButtons.js";
import { buildPanelEmbed, buildRecruitmentEmbed } from "../discord/embeds.js";
import { resolveSummonTargetLimit } from "../services/queuePresentation.js";

type QueueDisplayConfig = Pick<AppConfig, "callSize" | "queueCapacity">;

export function buildPanelMessagePayload(panel: Pick<Panel, "id">) {
  return {
    embeds: [buildPanelEmbed()],
    components: buildPanelButtons(panel.id),
    allowedMentions: { parse: [] },
  } as const;
}

export function buildRecruitmentMessagePayload(
  recruitment: Recruitment,
  members: QueueMember[],
  config: QueueDisplayConfig,
) {
  return {
    embeds: [
      buildRecruitmentEmbed(
        recruitment,
        members,
        config.callSize,
        config.queueCapacity,
      ),
    ],
    components: buildRecruitmentButtons(recruitment.id, {
      registrationClosed: recruitment.registrationState === "CLOSED",
      summonReady: resolveSummonTargetLimit(members.length, config.callSize) > 0,
      teamReady: recruitment.registrationState === "CLOSED" && members.length > 0,
    }),
    allowedMentions: { parse: [] },
  } as const;
}

export function buildInitialRecruitmentMessagePayload(
  recruitment: Recruitment,
  members: QueueMember[],
  config: QueueDisplayConfig,
) {
  return {
    ...buildRecruitmentMessagePayload(recruitment, members, config),
    content: "||@here||",
    allowedMentions: { parse: ["everyone"] },
  } as const;
}
