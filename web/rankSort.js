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
  ["IRON", "I"],
  ["BRONZE", "B"],
  ["SILVER", "S"],
  ["GOLD", "G"],
  ["PLATINUM", "P"],
  ["EMERALD", "E"],
  ["DIAMOND", "D"],
  ["MASTER", "M"],
  ["GRANDMASTER", "GM"],
  ["CHALLENGER", "C"],
]);

const DIVISION_LABELS = new Map([
  ["IV", "4"],
  ["III", "3"],
  ["II", "2"],
  ["I", "1"],
]);

const LEAGUE_POINT_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

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
    const tier = player.tier?.toUpperCase();
    const label = TIER_LABELS.get(tier) ?? player.tier ?? "?";
    if (LEAGUE_POINT_TIERS.has(tier)) {
      return `${label}${Number.isFinite(player.leaguePoints) ? player.leaguePoints : ""}`;
    }
    return `${label}${DIVISION_LABELS.get(player.division?.toUpperCase()) ?? ""}`;
  }
  if (player.status === "UNRANKED") return "언랭";
  if (player.status === "NOT_FOUND") return "ID 확인";
  if (player.status === "API_UNAVAILABLE") return "API 없음";
  return "조회 오류";
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
