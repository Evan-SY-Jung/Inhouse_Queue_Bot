/**
 * Discord 상호작용 뒤 사용자에게 표시되는 문구 모음입니다.
 * 버튼/모달 처리 로직은 두지 않고, 바뀌는 값만 함수 인자로 받습니다.
 */
export const INTERACTION_ACTION_NAMES = {
  registration: "마감/재오픈",
  teams: "팀 짜기",
  manualAdd: "수동 추가",
  manualRemove: "수동 제외",
  mention: "전체 멘션",
  summon: "전체 소환",
  delete: "삭제",
  deleteCancel: "삭제 취소",
} as const;

interface TeamBuilderReadyInput {
  url: string;
  selectedCount: number;
  excludedCount: number;
  rankedCount: number;
  unrankedCount: number;
  unavailableCount: number;
  expiresAt: number;
}

interface SummonCompletedInput {
  unlimited: boolean;
  moved: number;
  notConnected: number;
  alreadyThere: number;
  failed: number;
  refreshWarning: string;
  logWarning: string;
}

export const INTERACTION_MESSAGES = {
  common: {
    commandAdminOnly: "이 명령어는 관리자만 사용할 수 있어요.",
    guildOnly: "서버 안에서만 사용할 수 있는 기능이에요.",
    missingChannelPermissions: (permissions: readonly string[]) =>
      `봇에 필요한 채널 권한이 부족해요: ${permissions.join(", ")}`,
    genericFailure:
      "처리 중 오류가 발생했어요. 봇 권한과 로그를 확인한 뒤 다시 시도해 주세요.",
    errorReply: (message: string) => `❌ ${message}`,
  },
  modals: {
    manualAdd: {
      title: "대기열 수동 추가",
      memberLabel: "추가할 서버 멤버",
      memberDescription: "닉네임 일부만 입력해도 Discord가 가까운 후보를 보여줘요.",
      memberPlaceholder: "닉네임 일부를 입력해 서버 멤버 검색",
    },
    manualRemove: {
      title: "대기열 수동 제외",
      memberPlaceholder: (firstPosition: number, lastPosition: number) =>
        `${firstPosition}~${lastPosition}번째 참가자 선택`,
      queueLabel: (firstPosition: number, lastPosition: number) =>
        `${firstPosition}~${lastPosition}번째 대기열`,
      requiredDescription: "제외할 참가자를 선택하세요.",
      optionalDescription: "두 목록 중 한 곳에서만 참가자를 선택하세요.",
    },
    setup: {
      title: "내전 모집 패널 세팅",
      categoryPlaceholder: "예: 123456789012345678",
      categoryLabel: "모집 채널을 만들 카테고리 ID",
      categoryDescription: "개발자 모드에서 카테고리를 우클릭해 ID를 복사하세요.",
    },
    recruitment: {
      title: (isRift: boolean) => `${isRift ? "협곡" : "아람"} 내전 모집`,
      dateLabel: "날짜 (선택, MM/DD/YYYY)",
      timeLabel: "시간 (선택, HH:mm 24시간제)",
      timezoneLabel: "타임존 (선택)",
      timezoneDescription: "예약하려면 날짜·시간·타임존을 모두 입력하세요.",
      descriptionLabel: "내전 설명 (선택)",
      descriptionPlaceholder: "티어 제한, 진행 방식 등",
    },
    join: {
      title: "내전 신청",
      riotNameLabel: "라이엇 닉네임",
      riotNamePlaceholder: "게임 이름",
      riotTagLabel: "라이엇 태그",
      riotTagPlaceholder: "NA1 또는 1234 (# 제외 가능)",
    },
    summon: {
      title: "전체 소환 최종 확인",
      confirmationLabel: '확인을 위해 "전부 소환" 입력',
    },
    timezone: {
      placeholder: "타임존을 선택하지 않음",
      options: [
        {
          label: "PST — 미국 서부",
          value: "PST",
          description: "California · Nevada · Oregon · Washington 등...",
        },
        {
          label: "EST — 미국 동부",
          value: "EST",
          description: "Georgia · New York · Pennsylvania · Virginia 등...",
        },
        {
          label: "CST — 미국 중부",
          value: "CST",
          description: "Illinois · Iowa · Minnesota · Mississippi 등...",
        },
        {
          label: "MT — 미국 산악",
          value: "MT",
          description: "Arizona · Colorado · Montana · Utah 등...",
        },
      ],
    },
  },
  legacy: {
    reservationMoved:
      "내전 예약은 협곡 또는 아람 모집 버튼에서 날짜·시간·타임존을 입력해 만들 수 있어요.",
    reservationModalExpired:
      "이전 예약 모달은 만료됐어요. 협곡 또는 아람 모집 버튼을 다시 눌러 주세요.",
    managementMoved: "이전 관리 버튼은 더 이상 사용하지 않아요.",
  },
  panel: {
    adminOnly: "내전 패널은 관리자만 만들 수 있어요.",
    invalidCategoryId: "올바른 카테고리 ID를 입력해 주세요.",
    categoryNotFound:
      "해당 ID의 카테고리를 찾지 못했어요. 일반 채팅 채널 ID가 아닌 카테고리 ID인지 확인해 주세요.",
    alreadyExists: (channelId: string) =>
      `이 카테고리에는 이미 내전 모집 패널 <#${channelId}>이 있어요.`,
    created: (channelId: string) =>
      `내전 모집 패널을 만들었어요: <#${channelId}>`,
    invalid: "이 내전 모집 패널은 더 이상 유효하지 않아요.",
  },
  recruitment: {
    categoryMissing: "모집 패널의 카테고리가 없어졌어요.",
    created: (channelId: string) =>
      `내전 대기열이 성공적으로 생성되었어요!: <#${channelId}>`,
    invalid: "이 내전 모집은 더 이상 유효하지 않아요.",
    registrationClosed: "이 내전은 참가 신청이 마감됐어요.",
    registrationStillOpen: "먼저 참가 신청을 마감해 주세요.",
    registrationUpdated: (closed: boolean, refreshWarning: string) =>
      `${closed ? "참가 신청을 마감했어요." : "참가 신청을 다시 열었어요."}${refreshWarning}`,
    operatorOnly: (actionName: string) =>
      `권한이 부족해요. ${actionName} 기능은 모집 생성자, Discord 관리자 또는 내전관리자만 사용할 수 있어요.`,
    manualOperatorOnly: (actionName: string) =>
      `권한이 부족해요. ${actionName} 기능은 Discord 관리자 또는 내전관리자만 사용할 수 있어요.`,
    inhouseRoleRestricted:
      "권한이 부족해요. 내전 역할 사용자는 신청하기와 쫄튀하기만 사용할 수 있어요.",
  },
  queue: {
    joined: (positionMessage: string, refreshWarning: string) =>
      `참가 완료! ${positionMessage}${refreshWarning}`,
    left: (refreshWarning: string) => `이걸 쫄튀하네 ㅋ.${refreshWarning}`,
    firstPosition: (position: number) =>
      `현재 선착순 **${position}번째**예요.`,
    overallPosition: (position: number) =>
      `현재 전체 **${position}번째**예요.`,
    manualMemberMissing: "추가할 서버 멤버를 선택해 주세요.",
    botNotAllowed: "봇 계정은 대기열에 추가할 수 없어요.",
    guildMemberNotFound: "선택한 사용자를 이 서버에서 찾지 못했어요.",
    manuallyAdded: (memberId: string, position: number, refreshWarning: string) =>
      `<@${memberId}>님을 대기열 **${position}번째**로 수동 추가했어요.${refreshWarning}`,
    noMemberToRemove: "대기열에서 제외할 참가자가 없어요.",
    selectOneToRemove:
      "두 목록 중 한 곳에서 제외할 참가자 한 명만 선택해 주세요.",
    removalSelectionExpired:
      "선택한 참가자가 이미 대기열에서 빠졌어요. 수동 제외를 다시 눌러 주세요.",
    manuallyRemoved: (
      memberId: string,
      position: number,
      refreshWarning: string,
    ) =>
      `대기열 **${position}번째** <@${memberId}>님을 수동 제외했어요.${refreshWarning}`,
    refreshWarning:
      "\n⚠️ 변경 내용은 저장됐지만 임베드 갱신에 실패했어요. 다음 조작 때 다시 갱신됩니다.",
  },
  domain: {
    activePanelExists: "이 카테고리에는 이미 활성화된 내전 모집 패널이 있어요.",
    activeRecruitmentExists:
      "이미 같은 종류의 내전 모집을 만들었어요. 기존 모집을 먼저 삭제해 주세요.",
    recruitmentNotOpen: "이 내전 모집은 더 이상 열려 있지 않아요.",
    alreadyJoined: "이미 이 대기열에 참가하고 있어요.",
    notJoined: "현재 이 대기열에 참가하고 있지 않아요.",
    queueFull: (capacity: number) =>
      `이 대기열은 최대 ${capacity}명까지 참가할 수 있어요.`,
  },
  reservation: {
    incomplete:
      "예약하려면 날짜, 시간, 타임존을 모두 입력해 주세요. 예약하지 않으려면 세 항목을 모두 비워 주세요.",
    invalidDate: "날짜는 MM/DD/YYYY 형식으로 입력해 주세요.",
    invalidTime: "시간은 HH:mm 형식의 24시간제로 입력해 주세요.",
    missingTimezone: "타임존을 입력해 주세요.",
    invalidTimezone:
      "타임존이 올바르지 않아요. PST, EST, CST, MT 중 하나를 선택해 주세요.",
    invalidDateTime:
      "존재하지 않는 날짜 또는 시간이거나 서머타임 전환 구간이에요.",
    notFuture: "예약 시간은 현재보다 미래여야 해요.",
  },
  riotId: {
    invalidName: "라이엇 닉네임을 1~32자로 입력해 주세요.",
    invalidTag: "라이엇 태그를 # 없이 1~10자로 입력해 주세요.",
  },
  teamBuilder: {
    invalidTeamSize:
      "팀 편성 기준 인원은 2 이상의 짝수여야 해요. CALL_SIZE 설정을 확인해 주세요.",
    noMembers: "팀을 짜려면 참가자가 최소 1명 필요해요.",
    linkTooLong:
      "참가자 정보가 길어 Discord 링크 한도를 넘었어요. 닉네임을 줄인 뒤 다시 시도해 주세요.",
    ready: (input: TeamBuilderReadyInput) => {
      const excluded = input.excludedCount > 0
        ? ` · 후순위 제외 ${input.excludedCount}명`
        : "";
      return [
        "⚔️ **웹 팀 편성판을 준비했어요.**",
        `[드래그 팀 편성판 열기](${input.url})`,
        `선착순 ${input.selectedCount}명${excluded} · 랭크 ${input.rankedCount}명 · 언랭 ${input.unrankedCount}명 · 미조회 ${input.unavailableCount}명`,
        `링크는 <t:${Math.floor(input.expiresAt / 1_000)}:R> 만료돼요.`,
      ].join("\n");
    },
  },
  mention: {
    noMembers: "대기열에 멘션할 참가자가 없어요.",
    cooldown: (remainingMs: number) =>
      `서버 전체 멘션 쿨타임이에요. 약 ${Math.ceil(remainingMs / 1_000)}초 뒤에 다시 시도해 주세요.`,
    content: (targetIds: readonly string[]) =>
      `📣 **내전 인원 소환!**\n${targetIds.map((id) => `<@${id}>`).join(" ")}`,
  },
  summon: {
    alreadyUsed: "올 소환은 이 모집에서 이미 사용됐어요.",
    invalidConfirmation: (confirmation: string) =>
      `확인란에 정확히 "${confirmation}"이라고 입력해야 해요.`,
    missingBotPermissions: (permissions: readonly string[]) =>
      `봇의 음성 채널 권한이 부족해요: ${permissions.join(", ")}`,
    alreadyProcessing: "올 소환이 이미 사용됐거나 현재 처리 중이에요.",
    auditLog: (actorId: string, targetChannelId: string, movedIds: readonly string[]) =>
      `🔊 <@${actorId}>님이 **올 소환** 버튼으로 다음 인원을 <#${targetChannelId}> 채널로 이동시켰어요.\n${movedIds
        .map((id) => `<@${id}>`)
        .join(" ")}`,
    auditLogWarning:
      "\n⚠️ 음성 이동은 완료됐지만 채널에 소환 기록을 남기지 못했어요.",
    completed: (input: SummonCompletedInput) => {
      const usageMessage = input.unlimited
        ? "운영자 권한으로 횟수 제한 없이 올 소환을 실행했어요."
        : input.moved > 0
          ? "올 소환 사용을 완료했어요."
          : "실제로 이동한 사람이 없어 사용 횟수는 소모하지 않았어요.";
      return `${usageMessage}\n이동 **${input.moved}명** · 미접속 **${input.notConnected}명** · 이미 대상 방 **${input.alreadyThere}명** · 실패 **${input.failed}명**${input.refreshWarning}${input.logWarning}`;
    },
    notEnoughMembers: (required: number, current: number) =>
      `올 소환은 대기열이 최소 ${required}명 채워졌을 때 사용할 수 있어요. 현재 ${current}명이에요.`,
    voiceChannelNotFound: (channelId: string) =>
      `설정된 소환 음성 채널(<#${channelId}>)을 찾지 못했어요.`,
  },
  deletion: {
    confirmation:
      "⚠️ 정말 이 모집 채널과 대기열을 삭제할까요? 삭제하면 되돌릴 수 없어요.",
    cancelled: "삭제를 취소했어요.",
    channelAlreadyDeleted: "채널이 이미 삭제되어 모집 기록만 정리했어요.",
    deleting: "모집 채널을 삭제합니다.",
  },
} as const;
