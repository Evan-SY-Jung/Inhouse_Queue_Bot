import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { GameType, QueueMember } from "../../domain/models.js";
import { INTERACTION_MESSAGES } from "../../messages/interactionMessages.js";
import { SUMMON_CONFIRMATION_TEXT } from "../constants.js";
import { customIds } from "../customIds.js";
import { MODAL_FIELD_IDS } from "./modalFieldIds.js";

export function buildManualAddModal(recruitmentId: number): ModalBuilder {
  const memberSelect = new UserSelectMenuBuilder()
    .setCustomId(MODAL_FIELD_IDS.manualMember)
    .setPlaceholder(INTERACTION_MESSAGES.modals.manualAdd.memberPlaceholder)
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(customIds.manualAddModal(recruitmentId))
    .setTitle(INTERACTION_MESSAGES.modals.manualAdd.title)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.manualAdd.memberLabel)
        .setDescription(INTERACTION_MESSAGES.modals.manualAdd.memberDescription)
        .setUserSelectMenuComponent(memberSelect),
    );
}

export function buildManualRemoveModal(
  recruitmentId: number,
  members: readonly QueueMember[],
): ModalBuilder {
  const pageSize = 25;
  const pageCount = Math.ceil(members.length / pageSize);
  const labels: LabelBuilder[] = [];
  for (let offset = 0; offset < members.length; offset += pageSize) {
    const page = Math.floor(offset / pageSize);
    const pageMembers = members.slice(offset, offset + pageSize);
    const firstPosition = offset + 1;
    const lastPosition = offset + pageMembers.length;
    const required = pageCount === 1;
    const select = new StringSelectMenuBuilder()
      .setCustomId(MODAL_FIELD_IDS.manualRemove(page))
      .setPlaceholder(
        INTERACTION_MESSAGES.modals.manualRemove.memberPlaceholder(
          firstPosition,
          lastPosition,
        ),
      )
      .setMinValues(required ? 1 : 0)
      .setMaxValues(1)
      .setRequired(required)
      .addOptions(
        pageMembers.map((member, index) => ({
          label: `${offset + index + 1}. ${member.displayName}`.slice(0, 100),
          value: member.userId,
        })),
      );
    labels.push(
      new LabelBuilder()
        .setLabel(
          INTERACTION_MESSAGES.modals.manualRemove.queueLabel(
            firstPosition,
            lastPosition,
          ),
        )
        .setDescription(
          required
            ? INTERACTION_MESSAGES.modals.manualRemove.requiredDescription
            : INTERACTION_MESSAGES.modals.manualRemove.optionalDescription,
        )
        .setStringSelectMenuComponent(select),
    );
  }
  return new ModalBuilder()
    .setCustomId(customIds.manualRemoveModal(recruitmentId))
    .setTitle(INTERACTION_MESSAGES.modals.manualRemove.title)
    .addLabelComponents(labels);
}

export function buildSetupModal(): ModalBuilder {
  const categoryInput = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.categoryId)
    .setPlaceholder(INTERACTION_MESSAGES.modals.setup.categoryPlaceholder)
    .setMinLength(17)
    .setMaxLength(22)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  const categoryLabel = new LabelBuilder()
    .setLabel(INTERACTION_MESSAGES.modals.setup.categoryLabel)
    .setDescription(INTERACTION_MESSAGES.modals.setup.categoryDescription)
    .setTextInputComponent(categoryInput);

  return new ModalBuilder()
    .setCustomId(customIds.setupModal)
    .setTitle(INTERACTION_MESSAGES.modals.setup.title)
    .addLabelComponents(categoryLabel);
}

export function buildImmediateRecruitmentModal(
  panelId: number,
  gameType: GameType,
): ModalBuilder {
  const date = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.date)
    .setPlaceholder("12/31/2026")
    .setMaxLength(10)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);
  const time = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.time)
    .setPlaceholder("21:30")
    .setMaxLength(5)
    .setRequired(false)
    .setStyle(TextInputStyle.Short);
  const timezone = buildTimezoneSelect(false);

  return new ModalBuilder()
    .setCustomId(customIds.immediateModal(panelId, gameType))
    .setTitle(INTERACTION_MESSAGES.modals.recruitment.title(gameType === "RIFT"))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.recruitment.dateLabel)
        .setTextInputComponent(date),
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.recruitment.timeLabel)
        .setTextInputComponent(time),
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.recruitment.timezoneLabel)
        .setDescription(INTERACTION_MESSAGES.modals.recruitment.timezoneDescription)
        .setStringSelectMenuComponent(timezone),
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.recruitment.descriptionLabel)
        .setTextInputComponent(buildDescriptionInput()),
    );
}

export function buildJoinModal(recruitmentId: number): ModalBuilder {
  const riotName = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.riotName)
    .setPlaceholder(INTERACTION_MESSAGES.modals.join.riotNamePlaceholder)
    .setMinLength(1)
    .setMaxLength(32)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  const riotTag = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.riotTag)
    .setPlaceholder(INTERACTION_MESSAGES.modals.join.riotTagPlaceholder)
    .setMinLength(1)
    .setMaxLength(10)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(customIds.joinModal(recruitmentId))
    .setTitle(INTERACTION_MESSAGES.modals.join.title)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.join.riotNameLabel)
        .setTextInputComponent(riotName),
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.join.riotTagLabel)
        .setTextInputComponent(riotTag),
    );
}

export function buildSummonModal(recruitmentId: number): ModalBuilder {
  const confirmation = new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.summonConfirmation)
    .setPlaceholder(SUMMON_CONFIRMATION_TEXT)
    .setMinLength(SUMMON_CONFIRMATION_TEXT.length)
    .setMaxLength(SUMMON_CONFIRMATION_TEXT.length)
    .setRequired(true)
    .setStyle(TextInputStyle.Short);

  return new ModalBuilder()
    .setCustomId(customIds.summonModal(recruitmentId))
    .setTitle(INTERACTION_MESSAGES.modals.summon.title)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(INTERACTION_MESSAGES.modals.summon.confirmationLabel)
        .setTextInputComponent(confirmation),
    );
}

function buildTimezoneSelect(required: boolean): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(MODAL_FIELD_IDS.timezone)
    .setPlaceholder(INTERACTION_MESSAGES.modals.timezone.placeholder)
    .addOptions(...INTERACTION_MESSAGES.modals.timezone.options)
    .setMinValues(required ? 1 : 0)
    .setMaxValues(1)
    .setRequired(required);
}

function buildDescriptionInput(): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(MODAL_FIELD_IDS.description)
    .setPlaceholder(INTERACTION_MESSAGES.modals.recruitment.descriptionPlaceholder)
    .setMaxLength(1_000)
    .setRequired(false)
    .setStyle(TextInputStyle.Paragraph);
}
