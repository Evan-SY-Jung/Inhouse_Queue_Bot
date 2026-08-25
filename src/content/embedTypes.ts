import type { GameType } from "../domain/models.js";

export type EditableText = string | string[] | null;
export type EditableColor = number | string | null;

export interface EditableEmbedFooter {
  [key: string]: unknown;
  text?: string | null;
  icon_url?: string | null;
  iconURL?: string | null;
}

export type EditableFooter = string | EditableEmbedFooter | null;

export interface EditableEmbedAuthor {
  [key: string]: unknown;
  name?: string | null;
  url?: string | null;
  icon_url?: string | null;
  iconURL?: string | null;
}

export interface EditableEmbedMedia {
  [key: string]: unknown;
  url?: string | null;
}

export interface EditableEmbedField {
  [key: string]: unknown;
  name?: string | null;
  value?: string | null;
  inline?: boolean | null;
}

export interface EditableQueueConfig {
  [key: string]: unknown;
  enabled?: boolean | null;
  inline?: boolean | null;
  primaryName?: string | null;
  secondName?: string | null;
  waitingName?: string | null;
  emptyPrimary?: string | null;
  emptySecond?: string | null;
  emptyWaiting?: string | null;
}

export interface EditableEmbedTemplate {
  [key: string]: unknown;
  color?: EditableColor;
  title?: string | null;
  description?: EditableText;
  /** v0.2.x 설정 파일 호환용 별칭입니다. */
  descriptionLines?: string[] | null;
  url?: string | null;
  author?: EditableEmbedAuthor | null;
  footer?: EditableFooter;
  thumbnail?: string | EditableEmbedMedia | null;
  image?: string | EditableEmbedMedia | null;
  fields?: EditableEmbedField[] | EditableQueueConfig | null;
  timestamp?: string | number | Date | boolean | null;
}

export interface EditableRecruitmentEmbed extends EditableEmbedTemplate {
  colors?: Partial<Record<GameType, EditableColor>> | null;
  gameNames?: Partial<Record<GameType, string | null>> | null;
  gameEmojis?: Partial<Record<GameType, string | null>> | null;
  leads?: {
    [key: string]: unknown;
    immediate?: EditableText;
    reservation?: EditableText;
  } | null;
  sections?: {
    [key: string]: unknown;
    schedule?: EditableText;
    details?: EditableText;
  } | null;
  summonFooterTexts?: {
    [key: string]: unknown;
    available?: string | null;
    claimed?: string | null;
    used?: string | null;
  } | null;
  queue?: EditableQueueConfig | null;

  /** 아래 항목은 v0.2.x 설정 파일과의 호환을 위해 유지합니다. */
  titles?: {
    [key: string]: unknown;
    immediate?: string | null;
    reservation?: string | null;
  } | null;
  creatorLine?: string | null;
  scheduleHeading?: string | null;
  descriptionHeading?: string | null;
  joinPrompt?: string | null;
  footers?: {
    [key: string]: unknown;
    available?: EditableFooter;
    summonUsed?: EditableFooter;
  } | null;
}

export interface EmbedConfig {
  [key: string]: unknown;
  panel?: EditableEmbedTemplate | null;
  recruitment?: EditableRecruitmentEmbed | null;
}

export type TemplateValues = Record<string, string | number>;
