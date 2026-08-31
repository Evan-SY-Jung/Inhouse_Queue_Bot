import type { RiotId } from "./riotId.js";

export type RiotRankStatus =
  | "RANKED"
  | "UNRANKED"
  | "NOT_FOUND"
  | "API_UNAVAILABLE"
  | "API_ERROR";

export type RiotRankQueue = "SOLO" | "FLEX";

export interface RiotRankResult {
  riotName: string;
  riotTag: string;
  status: RiotRankStatus;
  queue: RiotRankQueue | null;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
}

export interface RiotRankLookup {
  lookupMany(riotIds: readonly RiotId[]): Promise<RiotRankResult[]>;
}

export interface RiotRankServiceOptions {
  apiKey: string | undefined;
  regionalRoute: string;
  platformRoute: string;
  cacheTtlMs: number;
  requestIntervalMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface AccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

interface LeagueEntryDto {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
}

interface CacheEntry {
  expiresAt: number;
  value: RiotRankResult;
}

const DEFAULT_REQUEST_INTERVAL_MS = 75;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const ERROR_CACHE_TTL_MS = 60_000;

export class RiotRankService implements RiotRankLookup {
  private readonly apiKey: string | undefined;
  private readonly regionalRoute: string;
  private readonly platformRoute: string;
  private readonly cacheTtlMs: number;
  private readonly requestIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<RiotRankResult>>();
  private requestGate: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private blockedUntil = 0;

  constructor(options: RiotRankServiceOptions) {
    this.apiKey = options.apiKey;
    this.regionalRoute = options.regionalRoute;
    this.platformRoute = options.platformRoute;
    this.cacheTtlMs = options.cacheTtlMs;
    this.requestIntervalMs = options.requestIntervalMs ?? DEFAULT_REQUEST_INTERVAL_MS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        }));
  }

  async lookupMany(riotIds: readonly RiotId[]): Promise<RiotRankResult[]> {
    return Promise.all(riotIds.map((riotId) => this.lookup(riotId)));
  }

  async lookup(riotId: RiotId): Promise<RiotRankResult> {
    const normalized = normalizeRiotId(riotId);
    if (!this.apiKey) return emptyRank(normalized, "API_UNAVAILABLE");

    const key = `${normalized.name.toLocaleLowerCase()}#${normalized.tag.toLocaleLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    if (cached) this.cache.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const lookup = this.lookupUncached(normalized)
      .then((value) => {
        const ttl =
          value.status === "API_ERROR"
            ? Math.min(this.cacheTtlMs, ERROR_CACHE_TTL_MS)
            : this.cacheTtlMs;
        this.cache.set(key, { expiresAt: this.now() + ttl, value });
        this.trimCache();
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, lookup);
    return lookup;
  }

  private async lookupUncached(riotId: RiotId): Promise<RiotRankResult> {
    let account: AccountDto;
    try {
      account = await this.requestJson<AccountDto>(
        `https://${this.regionalRoute}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId.name)}/${encodeURIComponent(riotId.tag)}`,
      );
    } catch (error) {
      if (error instanceof RiotApiRequestError && error.status === 404) {
        return emptyRank(riotId, "NOT_FOUND");
      }
      return emptyRank(riotId, "API_ERROR");
    }

    if (!account || typeof account.puuid !== "string" || !account.puuid) {
      return emptyRank(riotId, "API_ERROR");
    }

    const resolvedId = {
      name:
        typeof account.gameName === "string" && account.gameName.trim()
          ? account.gameName.trim()
          : riotId.name,
      tag:
        typeof account.tagLine === "string" && account.tagLine.trim()
          ? account.tagLine.trim()
          : riotId.tag,
    };

    let entries: LeagueEntryDto[];
    try {
      entries = await this.requestJson<LeagueEntryDto[]>(
        `https://${this.platformRoute}.api.riotgames.com/lol/league/v4/entries/by-puuid/${encodeURIComponent(account.puuid)}`,
      );
    } catch {
      return emptyRank(resolvedId, "API_ERROR");
    }
    if (!Array.isArray(entries)) {
      return emptyRank(resolvedId, "API_ERROR");
    }

    const entry =
      entries.find((candidate) => candidate.queueType === "RANKED_SOLO_5x5") ??
      entries.find((candidate) => candidate.queueType === "RANKED_FLEX_SR");
    if (!entry) return emptyRank(resolvedId, "UNRANKED");

    return {
      riotName: resolvedId.name,
      riotTag: resolvedId.tag,
      status: "RANKED",
      queue: entry.queueType === "RANKED_SOLO_5x5" ? "SOLO" : "FLEX",
      tier: stringOrNull(entry.tier)?.toUpperCase() ?? null,
      division: stringOrNull(entry.rank)?.toUpperCase() ?? null,
      leaguePoints: finiteNumberOrNull(entry.leaguePoints),
    };
  }

  private async requestJson<T>(url: string): Promise<T> {
    await this.waitForRequestSlot();
    if (this.blockedUntil > this.now()) throw new RiotApiRequestError(429);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "X-Riot-Token": this.apiKey ?? "",
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      throw new RiotApiRequestError(0, { cause: error });
    }
    if (!response.ok) {
      if (response.status === 429) {
        const retryAfterSeconds = Number(response.headers.get("Retry-After"));
        const retryAfterMs =
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds * 1_000
            : ERROR_CACHE_TTL_MS;
        this.blockedUntil = Math.max(this.blockedUntil, this.now() + retryAfterMs);
      } else if (response.status === 401 || response.status === 403) {
        this.blockedUntil = Math.max(this.blockedUntil, this.now() + ERROR_CACHE_TTL_MS);
      }
      throw new RiotApiRequestError(response.status);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new RiotApiRequestError(response.status, { cause: error });
    }
  }

  private async waitForRequestSlot(): Promise<void> {
    const wait = async (): Promise<void> => {
      const delayMs = Math.max(0, this.nextRequestAt - this.now());
      if (delayMs > 0) await this.sleep(delayMs);
      this.nextRequestAt = this.now() + this.requestIntervalMs;
    };
    const slot = this.requestGate.then(wait, wait);
    this.requestGate = slot.catch(() => undefined);
    await slot;
  }

  private trimCache(): void {
    while (this.cache.size > 500) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }
}

class RiotApiRequestError extends Error {
  constructor(
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(`Riot API 요청 실패 (${status || "network"})`, options);
    this.name = "RiotApiRequestError";
  }
}

function normalizeRiotId(riotId: RiotId): RiotId {
  return {
    name: riotId.name.trim(),
    tag: riotId.tag.trim().replace(/^#+/, ""),
  };
}

function emptyRank(riotId: RiotId, status: Exclude<RiotRankStatus, "RANKED">): RiotRankResult {
  return {
    riotName: riotId.name,
    riotTag: riotId.tag,
    status,
    queue: null,
    tier: null,
    division: null,
    leaguePoints: null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
