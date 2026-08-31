const SESSION_VERSION = 3;
const AVATAR_SESSION_VERSION = 2;
const LEGACY_SESSION_VERSION = 1;

export function parseTeamBuilderSession(value) {
  if (!Array.isArray(value)) {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }

  const version = value[0];
  let recruitmentId;
  let gameCode;
  let generatedAt;
  let expiresAt;
  let teamSize;
  let excludedCount;
  let rows;

  if (version === SESSION_VERSION && value.length === 8) {
    [, recruitmentId, gameCode, generatedAt, expiresAt, teamSize, excludedCount, rows] = value;
  } else if (version === AVATAR_SESSION_VERSION && value.length === 9) {
    let guildId;
    [, recruitmentId, gameCode, guildId, generatedAt, expiresAt, teamSize, excludedCount, rows] =
      value;
    if (!/^\d{17,20}$/.test(guildId)) {
      throw new Error("팀 편성 세션 값이 올바르지 않습니다.");
    }
  } else if (version === LEGACY_SESSION_VERSION && value.length === 8) {
    [, recruitmentId, gameCode, generatedAt, expiresAt, teamSize, excludedCount, rows] = value;
  } else {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }

  if (
    !Number.isInteger(recruitmentId) ||
    !["R", "A"].includes(gameCode) ||
    !Number.isInteger(generatedAt) ||
    !Number.isInteger(expiresAt) ||
    !Number.isInteger(teamSize) ||
    teamSize < 1 ||
    !Number.isInteger(excludedCount) ||
    excludedCount < 0 ||
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > teamSize * 4
  ) {
    throw new Error("팀 편성 세션 값이 올바르지 않습니다.");
  }

  return {
    version,
    recruitmentId,
    gameType: gameCode === "R" ? "RIFT" : "ARAM",
    generatedAt,
    expiresAt,
    teamSize,
    excludedCount,
    players: rows.map((row) => parsePlayer(row, version)),
  };
}

function parsePlayer(row, version) {
  if (!Array.isArray(row)) {
    throw new Error("참가자 데이터가 올바르지 않습니다.");
  }

  let riotName;
  let riotTag;
  let statusCode;
  let queueCode;
  let tier;
  let division;
  let points;

  if (version === SESSION_VERSION && row.length === 7) {
    [riotName, riotTag, statusCode, queueCode, tier, division, points] = row;
  } else if (version === AVATAR_SESSION_VERSION && row.length === 10) {
    const [
      displayName,
      compactRiotName,
      oldRiotTag,
      oldStatus,
      oldQueue,
      oldTier,
      oldDivision,
      oldPoints,
      userId,
      avatarRef,
    ] = row;
    validateOldIdentity(displayName, compactRiotName);
    if (
      !/^\d{17,20}$/.test(userId) ||
      !(/^[gu](?:a_)?[a-f0-9]{32}$/.test(avatarRef) || /^d[0-5]$/.test(avatarRef))
    ) {
      throw new Error("참가자 값이 올바르지 않습니다.");
    }
    riotName = compactRiotName || displayName;
    riotTag = oldRiotTag;
    statusCode = oldStatus;
    queueCode = oldQueue;
    tier = oldTier;
    division = oldDivision;
    points = oldPoints;
  } else if (version === LEGACY_SESSION_VERSION && row.length === 8) {
    const [
      displayName,
      compactRiotName,
      oldRiotTag,
      oldStatus,
      oldQueue,
      oldTier,
      oldDivision,
      oldPoints,
    ] = row;
    validateOldIdentity(displayName, compactRiotName);
    riotName = compactRiotName || displayName;
    riotTag = oldRiotTag;
    statusCode = oldStatus;
    queueCode = oldQueue;
    tier = oldTier;
    division = oldDivision;
    points = oldPoints;
  } else {
    throw new Error("참가자 데이터가 올바르지 않습니다.");
  }

  if (
    typeof riotName !== "string" ||
    riotName.length < 1 ||
    riotName.length > 32 ||
    typeof riotTag !== "string" ||
    riotTag.length > 10 ||
    !["R", "U", "N", "K", "E"].includes(statusCode) ||
    !["S", "F", ""].includes(queueCode) ||
    typeof tier !== "string" ||
    typeof division !== "string" ||
    !Number.isFinite(points)
  ) {
    throw new Error("참가자 값이 올바르지 않습니다.");
  }

  return {
    riotName,
    riotTag,
    status: { R: "RANKED", U: "UNRANKED", N: "NOT_FOUND", K: "API_UNAVAILABLE", E: "API_ERROR" }[
      statusCode
    ],
    queue: queueCode === "S" ? "SOLO" : queueCode === "F" ? "FLEX" : null,
    tier: tier || null,
    division: division || null,
    leaguePoints: points >= 0 ? points : null,
  };
}

function validateOldIdentity(displayName, compactRiotName) {
  if (
    typeof displayName !== "string" ||
    displayName.length > 40 ||
    typeof compactRiotName !== "string" ||
    compactRiotName.length > 32
  ) {
    throw new Error("참가자 값이 올바르지 않습니다.");
  }
}
