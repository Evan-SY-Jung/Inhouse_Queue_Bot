import { EmbedBuilder } from "discord.js";
import type {
  EditableColor,
  EditableEmbedAuthor,
  EditableEmbedField,
  EditableEmbedMedia,
  EditableEmbedTemplate,
  EditableFooter,
  EditableText,
  TemplateValues,
} from "../content/embedTypes.js";

const LIMITS = {
  totalCharacters: 6_000,
  title: 256,
  description: 4_096,
  authorName: 256,
  footerText: 2_048,
  fieldCount: 25,
  fieldName: 256,
  fieldValue: 1_024,
} as const;

export interface EmbedRenderState {
  fieldCount: number;
  hasContent: boolean;
  remainingCharacters: number;
}

export function applyEmbedTemplate(
  embed: EmbedBuilder,
  template: EditableEmbedTemplate,
  values: TemplateValues,
): EmbedRenderState {
  const state: EmbedRenderState = {
    fieldCount: 0,
    hasContent: false,
    remainingCharacters: LIMITS.totalCharacters,
  };

  const color = normalizeColor(template.color);
  if (color !== null) embed.setColor(color);

  setTextContent(embed, state, "title", template.title, values);
  const descriptionSource = hasOwn(template, "description")
    ? template.description
    : template.descriptionLines;
  setTextContent(embed, state, "description", descriptionSource, values);

  const url = normalizeUrl(template.url, values);
  if (url) embed.setURL(url);

  if (applyAuthor(embed, state, template.author, values)) state.hasContent = true;
  if (applyFooter(embed, state, template.footer, values)) state.hasContent = true;
  if (applyMedia(embed, "thumbnail", template.thumbnail, values)) state.hasContent = true;
  if (applyMedia(embed, "image", template.image, values)) state.hasContent = true;

  const timestamp = normalizeTimestamp(template.timestamp, values);
  if (timestamp) embed.setTimestamp(timestamp);

  if (Array.isArray(template.fields)) {
    for (const field of template.fields) {
      if (!addSafeField(embed, state, field, values)) continue;
      if (state.fieldCount >= LIMITS.fieldCount) break;
    }
  }

  return state;
}

export function addSafeField(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  field: EditableEmbedField,
  values: TemplateValues,
): boolean {
  if (state.fieldCount >= LIMITS.fieldCount || !field || typeof field !== "object") {
    return false;
  }

  const renderedName = renderEditableText(field.name, values);
  const renderedValue = renderEditableText(field.value, values);
  if (!renderedName || !renderedValue) return false;

  if (state.remainingCharacters < 2) return false;
  const nameLength = Math.min(
    renderedName.length,
    LIMITS.fieldName,
    state.remainingCharacters - 1,
  );
  const valueLength = Math.min(
    renderedValue.length,
    LIMITS.fieldValue,
    state.remainingCharacters - nameLength,
  );
  if (nameLength < 1 || valueLength < 1) return false;
  const name = renderedName.slice(0, nameLength);
  const value = renderedValue.slice(0, valueLength);
  state.remainingCharacters -= name.length + value.length;

  embed.addFields({ name, value, inline: field.inline === true });
  state.fieldCount += 1;
  state.hasContent = true;
  return true;
}

export function renderEditableText(
  source: EditableText | undefined,
  values: TemplateValues,
): string | null {
  if (source == null) return null;
  const raw = Array.isArray(source)
    ? source.filter((line): line is string => typeof line === "string").join("\n")
    : source;
  if (typeof raw !== "string") return null;

  const rendered = renderTemplate(raw, values)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return rendered.length > 0 ? rendered : null;
}

export function ensureEmbedHasContent(embed: EmbedBuilder, state: EmbedRenderState): void {
  if (!state.hasContent) embed.setDescription("\u200b");
}

function setTextContent(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  kind: "title" | "description",
  source: EditableText | undefined,
  values: TemplateValues,
): void {
  const rendered = renderEditableText(source, values);
  if (!rendered) return;
  const text = consumeText(
    state,
    rendered,
    kind === "title" ? LIMITS.title : LIMITS.description,
  );
  if (!text) return;

  if (kind === "title") embed.setTitle(text);
  else embed.setDescription(text);
  state.hasContent = true;
}

function applyAuthor(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  author: EditableEmbedAuthor | null | undefined,
  values: TemplateValues,
): boolean {
  if (!author || typeof author !== "object") return false;
  const renderedName = renderEditableText(author.name, values);
  if (!renderedName) return false;
  const name = consumeText(state, renderedName, LIMITS.authorName);
  if (!name) return false;

  const iconURL = normalizeUrl(author.iconURL ?? author.icon_url, values);
  const url = normalizeUrl(author.url, values);
  embed.setAuthor({
    name,
    ...(iconURL ? { iconURL } : {}),
    ...(url ? { url } : {}),
  });
  return true;
}

function applyFooter(
  embed: EmbedBuilder,
  state: EmbedRenderState,
  footer: EditableFooter | undefined,
  values: TemplateValues,
): boolean {
  if (footer == null) return false;
  const source = typeof footer === "string" ? { text: footer } : footer;
  const renderedText = renderEditableText(source.text, values);
  if (!renderedText) return false;
  const text = consumeText(state, renderedText, LIMITS.footerText);
  if (!text) return false;

  const iconURL = normalizeUrl(source.iconURL ?? source.icon_url, values);
  embed.setFooter({ text, ...(iconURL ? { iconURL } : {}) });
  return true;
}

function applyMedia(
  embed: EmbedBuilder,
  kind: "thumbnail" | "image",
  media: string | EditableEmbedMedia | null | undefined,
  values: TemplateValues,
): boolean {
  const rawUrl = typeof media === "string" ? media : media?.url;
  const url = normalizeUrl(rawUrl, values);
  if (!url) return false;

  if (kind === "thumbnail") embed.setThumbnail(url);
  else embed.setImage(url);
  return true;
}

function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token,
  );
}

function normalizeColor(color: EditableColor | undefined): number | null {
  if (typeof color === "number") {
    return Number.isInteger(color) && color >= 0 && color <= 0xffffff ? color : null;
  }
  if (typeof color !== "string") return null;
  const normalized = color.trim().replace(/^#/, "").replace(/^0x/i, "");
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : null;
}

function normalizeUrl(
  source: string | null | undefined,
  values: TemplateValues,
): string | null {
  if (typeof source !== "string") return null;
  const rendered = renderTemplate(source, values).trim();
  if (!rendered) return null;
  try {
    const url = new URL(rendered);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeTimestamp(
  source: string | number | Date | boolean | null | undefined,
  values: TemplateValues,
): Date | null {
  if (source === true) return new Date();
  if (source == null || source === false) return null;
  const date =
    source instanceof Date
      ? new Date(source.getTime())
      : typeof source === "number"
        ? new Date(source)
        : new Date(renderTemplate(source, values));
  return Number.isNaN(date.getTime()) ? null : date;
}

function consumeText(
  state: EmbedRenderState,
  text: string,
  componentLimit: number,
): string | null {
  const allowed = Math.min(componentLimit, state.remainingCharacters);
  if (allowed <= 0) return null;
  const result = text.slice(0, allowed);
  state.remainingCharacters -= result.length;
  return result || null;
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
