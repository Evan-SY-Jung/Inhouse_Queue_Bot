import { describe, expect, it } from "vitest";
import { RiotRankService } from "../src/services/riotApi.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Riot rank API", () => {
  it("resolves Riot ID to solo rank and caches the result", async () => {
    const calls: Array<{ url: string; token: string | null }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, token: new Headers(init?.headers).get("X-Riot-Token") });
      if (url.includes("/riot/account/")) {
        return jsonResponse({ puuid: "puuid-1", gameName: "정식이름", tagLine: "클로버" });
      }
      return jsonResponse([
        { queueType: "RANKED_FLEX_SR", tier: "SILVER", rank: "I", leaguePoints: 80 },
        { queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 31 },
      ]);
    }) as typeof fetch;
    const service = new RiotRankService({
      apiKey: "secret-key",
      regionalRoute: "americas",
      platformRoute: "na1",
      cacheTtlMs: 60_000,
      requestIntervalMs: 0,
      fetchImpl,
      now: () => 1_000,
    });

    const first = await service.lookup({ name: "정멤", tag: "클로버" });
    const second = await service.lookup({ name: "정멤", tag: "클로버" });

    expect(first).toEqual({
      riotName: "정식이름",
      riotTag: "클로버",
      status: "RANKED",
      queue: "SOLO",
      tier: "GOLD",
      division: "II",
      leaguePoints: 31,
    });
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain("americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/");
    expect(calls[1]?.url).toContain(
      "na1.api.riotgames.com/lol/league/v4/entries/by-puuid/puuid-1",
    );
    expect(calls.some((call) => call.url.includes("/lol/summoner/"))).toBe(false);
    expect(calls.every((call) => call.token === "secret-key")).toBe(true);
  });

  it("keeps the team builder available without exposing or requiring an API key", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch;
    const service = new RiotRankService({
      apiKey: undefined,
      regionalRoute: "americas",
      platformRoute: "na1",
      cacheTtlMs: 60_000,
      requestIntervalMs: 0,
      fetchImpl,
    });

    await expect(service.lookup({ name: "Evan", tag: "NA1" })).resolves.toMatchObject({
      status: "API_UNAVAILABLE",
      riotName: "Evan",
      riotTag: "NA1",
    });
    expect(called).toBe(false);
  });

  it("marks an unknown Riot ID without aborting the remaining session", async () => {
    const fetchImpl = (async () => jsonResponse({ status: { message: "not found" } }, 404)) as typeof fetch;
    const service = new RiotRankService({
      apiKey: "secret-key",
      regionalRoute: "americas",
      platformRoute: "na1",
      cacheTtlMs: 60_000,
      requestIntervalMs: 0,
      fetchImpl,
    });

    await expect(service.lookup({ name: "없는이름", tag: "NA1" })).resolves.toEqual({
      riotName: "없는이름",
      riotTag: "NA1",
      status: "NOT_FOUND",
      queue: null,
      tier: null,
      division: null,
      leaguePoints: null,
    });
  });

  it("does not mislabel a League API 404 as an unknown Riot ID", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/riot/account/")) {
        return jsonResponse({ puuid: "puuid-known", gameName: "Known", tagLine: "NA1" });
      }
      return jsonResponse({ status: { message: "not found" } }, 404);
    }) as typeof fetch;
    const service = new RiotRankService({
      apiKey: "secret-key",
      regionalRoute: "americas",
      platformRoute: "na1",
      cacheTtlMs: 60_000,
      requestIntervalMs: 0,
      fetchImpl,
    });

    await expect(service.lookup({ name: "Known", tag: "NA1" })).resolves.toMatchObject({
      riotName: "Known",
      riotTag: "NA1",
      status: "API_ERROR",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("/lol/league/v4/entries/by-puuid/puuid-known");
  });

  it("halts new requests for Riot's Retry-After window after a 429", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "120" },
      });
    }) as typeof fetch;
    const service = new RiotRankService({
      apiKey: "secret-key",
      regionalRoute: "americas",
      platformRoute: "na1",
      cacheTtlMs: 60_000,
      requestIntervalMs: 0,
      fetchImpl,
      now: () => 1_000,
    });

    await expect(service.lookup({ name: "First", tag: "NA1" })).resolves.toMatchObject({
      status: "API_ERROR",
    });
    await expect(service.lookup({ name: "Second", tag: "NA1" })).resolves.toMatchObject({
      status: "API_ERROR",
    });
    expect(calls).toBe(1);
  });
});
