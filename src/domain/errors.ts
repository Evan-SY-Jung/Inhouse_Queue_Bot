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
    super("이 카테고리에는 이미 활성화된 내전 모집 패널이 있어요.", "ACTIVE_PANEL_EXISTS");
  }
}

export class ActiveRecruitmentExistsError extends DomainError {
  constructor() {
    super("이미 같은 종류의 내전 모집을 만들었어요. 기존 모집을 먼저 삭제해 주세요.", "ACTIVE_RECRUITMENT_EXISTS");
  }
}

export class RecruitmentNotOpenError extends DomainError {
  constructor() {
    super("이 내전 모집은 더 이상 열려 있지 않아요.", "RECRUITMENT_NOT_OPEN");
  }
}

export class AlreadyJoinedError extends DomainError {
  constructor() {
    super("이미 이 대기열에 참가하고 있어요.", "ALREADY_JOINED");
  }
}

export class NotJoinedError extends DomainError {
  constructor() {
    super("현재 이 대기열에 참가하고 있지 않아요.", "NOT_JOINED");
  }
}

export class QueueFullError extends DomainError {
  constructor(capacity: number) {
    super(`이 대기열은 최대 ${capacity}명까지 참가할 수 있어요.`, "QUEUE_FULL");
  }
}

export class RegistrationClosedError extends DomainError {
  constructor() {
    super("이 내전은 참가 신청이 마감됐어요.", "REGISTRATION_CLOSED");
  }
}
