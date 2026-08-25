import { EmbedBuilder, escapeMarkdown, time, TimestampStyles } from "discord.js";
import { EMBED_CONFIG } from "../content/embedConfig.js";
import type {
  EditableColor,
  EditableEmbedTemplate,
  EditableFooter,
  EditableQueueConfig,
  EditableRecruitmentEmbed,
  EditableText,
  TemplateValues,
} from "../content/embedTypes.js";
import type { QueueMember, Recruitment } from "../domain/models.js";
import {
  addSafeField,
  applyEmbedTemplate,
  ensureEmbedHasContent,
  renderEditableText,
  type EmbedRenderState,
} from "./embedRenderer.js";

const MAX_FIELD_LENGTH = 1_024;

export function buildPanelEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder();
  const state = applyEmbedTemplate(embed, EMBED_CONFIG.panel ?? {}, {});
  ensureEmbedHasContent(embed, state);
  return embed;
}

export function buildRecruitmentEmbed(
  recruitment: Recruitment,
  members: QueueMember[],
  callSize: number,
  capacity: number,
): EmbedBuilder {
  const config = EMBED_CONFIG.recruitment ?? {};
  const isReservation = recruitment.kind === "RESERVATION";
  const values = createRecruitmentValues(
    config,
    recruitment,
    members.length,
    callSize,
    capacity,
  );
  populateDynamicSections(config, recruitment, isReservation, values);

  const template: EditableEmbedTemplate = {
    ...config,
    color: resolveRecruitmentColor(config, recruitment),
    title: resolveRecruitmentTitle(config, isReservation),
    description: resolveRecruitmentDescription(config, isReservation, values),
    footer: resolveRecruitmentFooter(config, recruitment),
  };
  const embed = new EmbedBuilder();
  const state = applyEmbedTemplate(embed, template, values);
  addQueueFields(
    embed,
    state,
    resolveQueueConfig(config),
    members,
    callSize,
    capacity,
    values,
  );
  ensureEmbedHasContent(embed, state);
  return embed;
}

function createRecruitmentValues(
  config: EditableRecruitmentEmbed,
  recruitment: Recruitment,
  memberCount: number,
  callSize: number,
  capacity: number,
): TemplateValues {
  const isReservation = recruitment.kind === "RESERVATION";
  return {
    creatorId: recruitment.creatorId,
    creatorMention: `<@${recruitment.creatorId}>`,
    emoji: config.gameEmojis?.[recruitment.gameType] ?? "",
    game: config.gameNames?.[recruitment.gameType] ?? "",
    reservationPrefix: isReservation ? "예약 " : "",
    callSize,
    capacity,
    memberCount,
    createdAtIso: new Date(recruitment.createdAt).toISOString(),
    providedDescription: recruitment.description
      ? escapeMarkdown(recruitment.description)
      : "",
    scheduledFull: "",
    scheduledRelative: "",
    lead: "",
    scheduleSection: "",
    descriptionSection: "",
    summonFooter: "",
  };
}

function populateDynamicSections(
  config: EditableRecruitmentEmbed,
  recruitment: Recruitment,
  isReservation: boolean,
  values: TemplateValues,
): void {
  values.lead =
    renderEditableText(
      isReservation ? config.leads?.reservation : config.leads?.immediate,
      values,
    ) ?? "";

  if (recruitment.scheduledAt) {
    const seconds = Math.floor(recruitment.scheduledAt / 1_000);
    values.scheduledFull = time(seconds, TimestampStyles.FullDateShortTime);
    values.scheduledRelative = time(seconds, TimestampStyles.RelativeTime);
    values.scheduleSection = renderScheduleSection(config, values);
  }

  if (recruitment.description) {
    values.descriptionSection = renderDetailsSection(config, values);
  }

  values.summonFooter = renderSummonFooter(config, recruitment, values);
}

function resolveRecruitmentColor(
  config: EditableRecruitmentEmbed,
  recruitment: Recruitment,
): EditableColor {
  if (config.colors && hasOwn(config.colors, recruitment.gameType)) {
    return config.colors[recruitment.gameType] ?? null;
  }
  return config.color ?? null;
}

function resolveRecruitmentTitle(
  config: EditableRecruitmentEmbed,
  isReservation: boolean,
): string | null {
  if (hasOwn(config, "title")) return config.title ?? null;
  return (isReservation ? config.titles?.reservation : config.titles?.immediate) ?? null;
}

function resolveRecruitmentDescription(
  config: EditableRecruitmentEmbed,
  isReservation: boolean,
  values: TemplateValues,
): EditableText {
  if (hasOwn(config, "description")) return config.description ?? null;
  if (hasOwn(config, "descriptionLines")) return config.descriptionLines ?? null;

  const sections: string[] = [];
  appendRenderedSection(sections, config.creatorLine, values);
  appendRenderedSection(
    sections,
    isReservation ? config.leads?.reservation : config.leads?.immediate,
    values,
  );
  appendRenderedSection(sections, String(values.scheduleSection), values);
  appendRenderedSection(sections, String(values.descriptionSection), values);
  appendRenderedSection(sections, config.joinPrompt, values);
  return sections.length > 0 ? sections.join("\n\n") : null;
}

function resolveRecruitmentFooter(
  config: EditableRecruitmentEmbed,
  recruitment: Recruitment,
): EditableFooter {
  if (hasOwn(config, "footer")) return config.footer ?? null;
  if (!config.footers) return null;
  return (
    (recruitment.summonState === "USED"
      ? config.footers.summonUsed
      : config.footers.available) ?? null
  );
}

function resolveQueueConfig(config: EditableRecruitmentEmbed): EditableQueueConfig | null {
  if (hasOwn(config, "queue")) return config.queue ?? null;
  if (config.fields && !Array.isArray(config.fields)) return config.fields;
  return null;
}

function renderScheduleSection(
  config: EditableRecruitmentEmbed,
  values: TemplateValues,
): string {
  if (config.sections && hasOwn(config.sections, "schedule")) {
    return renderEditableText(config.sections.schedule, values) ?? "";
  }
  if (!hasOwn(config, "scheduleHeading")) return "";
  const heading = renderEditableText(config.scheduleHeading, values);
  const timestamp = `${values.scheduledFull} (${values.scheduledRelative})`.trim();
  return [heading, timestamp].filter(Boolean).join("\n");
}

function renderDetailsSection(
  config: EditableRecruitmentEmbed,
  values: TemplateValues,
): string {
  if (config.sections && hasOwn(config.sections, "details")) {
    return renderEditableText(config.sections.details, values) ?? "";
  }
  if (!hasOwn(config, "descriptionHeading")) return "";
  const heading = renderEditableText(config.descriptionHeading, values);
  const description = String(values.providedDescription || "");
  return [heading, description].filter(Boolean).join("\n");
}

function renderSummonFooter(
  config: EditableRecruitmentEmbed,
  recruitment: Recruitment,
  values: TemplateValues,
): string {
  const source =
    recruitment.summonState === "USED"
      ? config.summonFooterTexts?.used
      : recruitment.summonState === "CLAIMED"
        ? config.summonFooterTexts?.claimed
        : config.summonFooterTexts?.available;
  return renderEditableText(source, values) ?? "";
}

function appendRenderedSection(
  target: string[],
  source: EditableText | undefined,
  values: TemplateValues,
): void {
  const rendered = renderEditableText(source, values);
  if (rendered) target.push(rendered);
}

function addQueueFields(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  queue: EditableQueueConfig | null,
  members: QueueMember[],
  callSize: number,
  capacity: number,
  baseValues: TemplateValues,
): void {
  if (!queue || queue.enabled === false) return;
  const inline = queue.inline !== false;
  const primary = members.slice(0, callSize);
  const second = members.slice(callSize, capacity);
  const waiting = members.slice(capacity);

  appendQueueField(
    embed,
    state,
    queue.primaryName,
    primary,
    queue.emptyPrimary,
    { ...baseValues, count: primary.length, limit: callSize },
    inline,
  );
  if (members.length >= callSize) {
    appendQueueField(
      embed,
      state,
      queue.secondName,
      second,
      queue.emptySecond,
      {
        ...baseValues,
        count: Math.min(members.length, capacity),
        limit: capacity,
      },
      inline,
    );
  }
  if (members.length >= capacity) {
    appendQueueField(
      embed,
      state,
      queue.waitingName,
      waiting,
      queue.emptyWaiting,
      { ...baseValues, count: waiting.length, limit: capacity },
      inline,
    );
  }
}

function appendQueueField(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  nameTemplate: string | null | undefined,
  members: QueueMember[],
  emptyTemplate: string | null | undefined,
  values: TemplateValues,
  inline: boolean,
): void {
  const name = renderEditableText(nameTemplate, values);
  const emptyMessage = renderEditableText(emptyTemplate, values);
  const value = formatMembers(members, emptyMessage);
  if (!name || !value) return;
  addSafeField(embed, state, { name, value, inline }, values);
}

function formatMembers(members: QueueMember[], emptyMessage: string | null): string | null {
  if (members.length === 0) return emptyMessage;

  const shown: string[] = [];
  for (const member of members) {
    const line = `<@${member.userId}>`;
    const remaining = members.length - shown.length - 1;
    const suffix = remaining > 0 ? `\n… 외 ${remaining}명` : "";
    if ([...shown, line].join("\n").length + suffix.length > MAX_FIELD_LENGTH) break;
    shown.push(line);
  }

  const remaining = members.length - shown.length;
  return `${shown.join("\n")}${remaining > 0 ? `\n… 외 ${remaining}명` : ""}`;
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
