const TIER_ORDER = new Map(
  [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
  ].map((tier, index) => [tier, index]),
);

const DIVISION_ORDER = new Map(
  ["IV", "III", "II", "I"].map((division, index) => [division, index]),
);

const TIER_LABELS = new Map([
  ["IRON", "아이언"],
  ["BRONZE", "브론즈"],
  ["SILVER", "실버"],
  ["GOLD", "골드"],
  ["PLATINUM", "플래티넘"],
  ["EMERALD", "에메랄드"],
  ["DIAMOND", "다이아몬드"],
  ["MASTER", "마스터"],
  ["GRANDMASTER", "그랜드마스터"],
  ["CHALLENGER", "챌린저"],
]);

export function comparePlayersByRank(left, right, direction) {
  const leftRank = rankParts(left);
  const rightRank = rankParts(right);

  if (!leftRank && !rightRank) return left.position - right.position;
  if (!leftRank) return 1;
  if (!rightRank) return -1;

  const multiplier = direction === "low" ? 1 : -1;
  for (let index = 0; index < leftRank.length; index += 1) {
    const difference = leftRank[index] - rightRank[index];
    if (difference !== 0) return difference * multiplier;
  }
  return left.position - right.position;
}

export function formatRankLabel(player) {
  if (player.status === "RANKED") {
    const tier = TIER_LABELS.get(player.tier?.toUpperCase()) ?? player.tier ?? "티어 미확인";
    const division = player.division ? ` ${player.division}` : "";
    const points = Number.isFinite(player.leaguePoints) ? ` ${player.leaguePoints}LP` : "";
    return `${tier}${division}${points}`;
  }
  if (player.status === "UNRANKED") return "언랭크";
  if (player.status === "NOT_FOUND") return "ID 확인";
  if (player.status === "API_UNAVAILABLE") return "API 미설정";
  return "조회 실패";
}

function rankParts(player) {
  if (player.status !== "RANKED" || !player.tier) return null;
  const tier = TIER_ORDER.get(player.tier.toUpperCase());
  if (tier === undefined) return null;
  const division = player.division
    ? (DIVISION_ORDER.get(player.division.toUpperCase()) ?? -1)
    : -1;
  const leaguePoints = Number.isFinite(player.leaguePoints) ? player.leaguePoints : 0;
  return [tier, division, leaguePoints];
}
