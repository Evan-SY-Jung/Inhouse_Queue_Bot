import type { QueueMember } from "../domain/models.js";

export interface TeamGame {
  gameNumber: number;
  blue: QueueMember[];
  red: QueueMember[];
}

export function createTeamGames(
  members: QueueMember[],
  gameSize: number,
  maxPlayers: number,
  random: () => number = Math.random,
): TeamGame[] {
  if (!Number.isInteger(gameSize) || gameSize < 2 || gameSize % 2 !== 0) {
    throw new Error("팀 편성 인원은 2 이상의 짝수여야 합니다.");
  }

  const completePlayerCount = Math.min(
    Math.floor(members.length / gameSize) * gameSize,
    Math.floor(maxPlayers / gameSize) * gameSize,
  );
  const games: TeamGame[] = [];

  for (let offset = 0; offset < completePlayerCount; offset += gameSize) {
    const shuffled = shuffle(members.slice(offset, offset + gameSize), random);
    const teamSize = gameSize / 2;
    games.push({
      gameNumber: games.length + 1,
      blue: shuffled.slice(0, teamSize),
      red: shuffled.slice(teamSize),
    });
  }
  return games;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
  return values;
}
