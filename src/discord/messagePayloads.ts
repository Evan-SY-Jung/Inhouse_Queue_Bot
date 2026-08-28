import type { AppConfig } from "../config.js";
import type { Panel, QueueMember, Recruitment } from "../domain/models.js";
import { resolveSummonTargetLimit } from "../services/queuePresentation.js";
import { buildPanelButtons, buildRecruitmentButtons } from "./components.js";
import { buildPanelEmbed, buildRecruitmentEmbed } from "./embeds.js";

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
    components: buildRecruitmentButtons(
      recruitment.id,
      recruitment.summonState === "USED",
      resolveSummonTargetLimit(
        members.length,
        config.callSize,
        config.queueCapacity,
      ) > 0,
    ),
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
