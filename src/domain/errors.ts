import { INTERACTION_MESSAGES } from "../messages/interactionMessages.js";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ActivePanelExistsError extends DomainError {
  constructor() {
    super(INTERACTION_MESSAGES.domain.activePanelExists, "ACTIVE_PANEL_EXISTS");
  }
}

export class ActiveRecruitmentExistsError extends DomainError {
  constructor() {
    super(
      INTERACTION_MESSAGES.domain.activeRecruitmentExists,
      "ACTIVE_RECRUITMENT_EXISTS",
    );
  }
}

export class RecruitmentNotOpenError extends DomainError {
  constructor() {
    super(
      INTERACTION_MESSAGES.domain.recruitmentNotOpen,
      "RECRUITMENT_NOT_OPEN",
    );
  }
}

export class AlreadyJoinedError extends DomainError {
  constructor() {
    super(INTERACTION_MESSAGES.domain.alreadyJoined, "ALREADY_JOINED");
  }
}

export class NotJoinedError extends DomainError {
  constructor() {
    super(INTERACTION_MESSAGES.domain.notJoined, "NOT_JOINED");
  }
}

export class QueueFullError extends DomainError {
  constructor(capacity: number) {
    super(INTERACTION_MESSAGES.domain.queueFull(capacity), "QUEUE_FULL");
  }
}

export class RegistrationClosedError extends DomainError {
  constructor() {
    super(
      INTERACTION_MESSAGES.recruitment.registrationClosed,
      "REGISTRATION_CLOSED",
    );
  }
}
