import { gzipSync, gunzipSync } from "node:zlib";
import { DomainError } from "../domain/errors.js";
import type { GameType, QueueMember, Recruitment } from "../domain/models.js";
import type {
  RiotRankLookup,
  RiotRankQueue,
  RiotRankResult,
  RiotRankStatus,
} from "./riotApi.js";
import { parseRiotId, type RiotId } from "./riotId.js";

export const TEAM_BUILDER_SESSION_VERSION = 3;
const TEAM_BUILDER_WEB_VERSION = 6;
const DEFAULT_MAX_URL_LENGTH = 1_700;

type RankStatusCode = "R" | "U" | "N" | "K" | "E";
type RankQueueCode = "S" | "F" | "";
type GameTypeCode = "R" | "A";

type CompactPlayer = [
  riotName: string,
  riotTag: string,
  status: RankStatusCode,
  queue: RankQueueCode,
  tier: string,
  division: string,
  leaguePoints: number,
];

type CompactSession = [
  version: typeof TEAM_BUILDER_SESSION_VERSION,
  recruitmentId: number,
  gameType: GameTypeCode,
  generatedAt: number,
  expiresAt: number,
  teamSize: number,
  excludedCount: number,
  players: CompactPlayer[],
];

export interface TeamBuilderPlayer {
  riotName: string;
  riotTag: string;
  status: RiotRankStatus;
  queue: RiotRankQueue | null;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
}

export interface TeamBuilderSession {
  version: typeof TEAM_BUILDER_SESSION_VERSION;
  recruitmentId: number;
  gameType: GameType;
  generatedAt: number;
  expiresAt: number;
  teamSize: number;
  excludedCount: number;
  players: TeamBuilderPlayer[];
}

export interface TeamBuilderLinkResult {
  url: string;
  selectedCount: number;
  excludedCount: number;
  rankedCount: number;
  unrankedCount: number;
  unavailableCount: number;
  expiresAt: number;
}

export interface TeamBuilderOptions {
  baseUrl: string;
  fixedMemberTag: string;
  callSize: number;
  sessionTtlMs: number;
  maxUrlLength?: number;
  now?: () => number;
}

export class TeamBuilderService {
  private readonly maxUrlLength: number;
  private readonly now: () => number;

  constructor(
    private readonly rankLookup: RiotRankLookup,
    private readonly options: TeamBuilderOptions,
  ) {
    this.maxUrlLength = options.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;
    this.now = options.now ?? Date.now;
  }

  async createLink(
    recruitment: Pick<Recruitment, "id" | "gameType">,
    members: readonly QueueMember[],
  ): Promise<TeamBuilderLinkResult> {
    const callSize = this.options.callSize;
    if (!Number.isInteger(callSize) || callSize < 2 || callSize % 2 !== 0) {
      throw new DomainError(
        "팀 편성 기준 인원은 2 이상의 짝수여야 해요. CALL_SIZE 설정을 확인해 주세요.",
        "INVALID_TEAM_SIZE",
      );
    }

    const selectedCount = Math.min(members.length, callSize * 2);
    if (selectedCount < 1) {
      throw new DomainError(
        "팀을 짜려면 참가자가 최소 1명 필요해요.",
        "NOT_ENOUGH_MEMBERS",
      );
    }

    const selected = members.slice(0, selectedCount);
    const riotIds = selected.map((member) =>
      resolveQueueMemberRiotId(member, this.options.fixedMemberTag),
    );
    const ranks = await this.rankLookup.lookupMany(riotIds);
    if (ranks.length !== selected.length) {
      throw new Error("Riot 티어 조회 결과 수가 참가자 수와 일치하지 않습니다.");
    }

    const generatedAtMs = this.now();
    const expiresAtMs = generatedAtMs + this.options.sessionTtlMs;
    const session: TeamBuilderSession = {
      version: TEAM_BUILDER_SESSION_VERSION,
      recruitmentId: recruitment.id,
      gameType: recruitment.gameType,
      generatedAt: Math.floor(generatedAtMs / 1_000),
      expiresAt: Math.floor(expiresAtMs / 1_000),
      teamSize: callSize / 2,
      excludedCount: members.length - selectedCount,
      players: ranks.map(toTeamBuilderPlayer),
    };
    const encoded = encodeTeamBuilderSession(session);
    const url = new URL(this.options.baseUrl);
    url.searchParams.set("v", String(TEAM_BUILDER_WEB_VERSION));
    url.hash = `s=${encoded}`;
    const href = url.toString();
    if (href.length > this.maxUrlLength) {
      throw new DomainError(
        "참가자 정보가 길어 Discord 링크 한도를 넘었어요. 닉네임을 줄인 뒤 다시 시도해 주세요.",
        "TEAM_BUILDER_LINK_TOO_LONG",
      );
    }

    return {
      url: href,
      selectedCount,
      excludedCount: session.excludedCount,
      rankedCount: ranks.filter((rank) => rank.status === "RANKED").length,
      unrankedCount: ranks.filter((rank) => rank.status === "UNRANKED").length,
      unavailableCount: ranks.filter(
        (rank) => rank.status !== "RANKED" && rank.status !== "UNRANKED",
      ).length,
      expiresAt: expiresAtMs,
    };
  }
}

export function resolveQueueMemberRiotId(
  member: Pick<QueueMember, "displayName" | "riotName" | "riotTag">,
  fixedMemberTag: string,
): RiotId {
  const submittedName = member.riotName?.trim();
  const submittedTag = member.riotTag?.trim();
  if (submittedName && submittedTag) return parseRiotId(submittedName, submittedTag);

  const formattedMemberName =
    !submittedName && !submittedTag
      ? extractMemberRiotName(member.displayName)
      : null;
  const name = (
    submittedName ||
    formattedMemberName ||
    member.displayName.trim()
  ).slice(0, 32);
  if (!submittedTag) {
    const hashIndex = name.lastIndexOf("#");
    if (hashIndex > 0 && hashIndex < name.length - 1) {
      try {
        return parseRiotId(name.slice(0, hashIndex), name.slice(hashIndex + 1));
      } catch {
        // Discord 닉네임의 #이 Riot ID 구분자가 아니면 고정 태그를 사용합니다.
      }
    }
  }
  return parseRiotId(name, submittedTag || fixedMemberTag);
}

function extractMemberRiotName(displayName: string): string | null {
  const parts = displayName.trim().split(/\s+/u);
  if (parts.length < 4) return null;

  const roleMark = parts[0];
  const realName = parts.at(-2);
  const memberNumber = parts.at(-1);
  const riotName = parts.slice(1, -2).join(" ");
  if (
    !roleMark ||
    !/^[^\p{L}\p{N}]+$/u.test(roleMark) ||
    !riotName ||
    !realName ||
    !/^\d{2}$/.test(memberNumber ?? "")
  ) {
    return null;
  }
  return riotName;
}

export function encodeTeamBuilderSession(session: TeamBuilderSession): string {
  const compact: CompactSession = [
    TEAM_BUILDER_SESSION_VERSION,
    session.recruitmentId,
    session.gameType === "RIFT" ? "R" : "A",
    session.generatedAt,
    session.expiresAt,
    session.teamSize,
    session.excludedCount,
    session.players.map((player) => [
      player.riotName.slice(0, 32),
      player.riotTag.slice(0, 10),
      statusToCode(player.status),
      queueToCode(player.queue),
      player.tier ?? "",
      player.division ?? "",
      player.leaguePoints ?? -1,
    ]),
  ];
  return gzipSync(Buffer.from(JSON.stringify(compact)), { level: 9 }).toString("base64url");
}

export function decodeTeamBuilderSession(encoded: string): TeamBuilderSession {
  const parsed = JSON.parse(
    gunzipSync(Buffer.from(encoded, "base64url")).toString("utf8"),
  ) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 8 || parsed[0] !== TEAM_BUILDER_SESSION_VERSION) {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }
  const [
    version,
    recruitmentId,
    gameCode,
    generatedAt,
    expiresAt,
    teamSize,
    excludedCount,
    rows,
  ] = parsed;
  if (
    typeof recruitmentId !== "number" ||
    (gameCode !== "R" && gameCode !== "A") ||
    typeof generatedAt !== "number" ||
    typeof expiresAt !== "number" ||
    typeof teamSize !== "number" ||
    typeof excludedCount !== "number" ||
    !Array.isArray(rows)
  ) {
    throw new Error("팀 편성 세션 형식이 올바르지 않습니다.");
  }

  return {
    version,
    recruitmentId,
    gameType: gameCode === "R" ? "RIFT" : "ARAM",
    generatedAt,
    expiresAt,
    teamSize,
    excludedCount,
    players: rows.map(decodePlayer),
  };
}

function toTeamBuilderPlayer(rank: RiotRankResult): TeamBuilderPlayer {
  return {
    riotName: rank.riotName,
    riotTag: rank.riotTag,
    status: rank.status,
    queue: rank.queue,
    tier: rank.tier,
    division: rank.division,
    leaguePoints: rank.leaguePoints,
  };
}

function decodePlayer(value: unknown): TeamBuilderPlayer {
  if (!Array.isArray(value) || value.length !== 7) {
    throw new Error("팀 편성 참가자 형식이 올바르지 않습니다.");
  }
  const [
    riotName,
    riotTag,
    statusCode,
    queueCode,
    tier,
    division,
    points,
  ] = value;
  if (
    typeof riotName !== "string" ||
    typeof riotTag !== "string" ||
    typeof statusCode !== "string" ||
    typeof queueCode !== "string" ||
    typeof tier !== "string" ||
    typeof division !== "string" ||
    typeof points !== "number"
  ) {
    throw new Error("팀 편성 참가자 값이 올바르지 않습니다.");
  }
  return {
    riotName,
    riotTag,
    status: codeToStatus(statusCode),
    queue: codeToQueue(queueCode),
    tier: tier || null,
    division: division || null,
    leaguePoints: points >= 0 ? points : null,
  };
}

function statusToCode(status: RiotRankStatus): RankStatusCode {
  switch (status) {
    case "RANKED":
      return "R";
    case "UNRANKED":
      return "U";
    case "NOT_FOUND":
      return "N";
    case "API_UNAVAILABLE":
      return "K";
    case "API_ERROR":
      return "E";
  }
}

function codeToStatus(code: string): RiotRankStatus {
  switch (code) {
    case "R":
      return "RANKED";
    case "U":
      return "UNRANKED";
    case "N":
      return "NOT_FOUND";
    case "K":
      return "API_UNAVAILABLE";
    case "E":
      return "API_ERROR";
    default:
      throw new Error("알 수 없는 Riot 티어 상태입니다.");
  }
}

function queueToCode(queue: RiotRankQueue | null): RankQueueCode {
  return queue === "SOLO" ? "S" : queue === "FLEX" ? "F" : "";
}

function codeToQueue(code: string): RiotRankQueue | null {
  if (code === "S") return "SOLO";
  if (code === "F") return "FLEX";
  if (code === "") return null;
  throw new Error("알 수 없는 Riot 랭크 큐입니다.");
}
