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
