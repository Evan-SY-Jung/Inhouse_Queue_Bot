import { loadConfig } from "./config.js";
import { SqliteRecruitmentRepository } from "./db/sqliteRepository.js";
import { BotController } from "./discord/BotController.js";
import { RiotRankService } from "./services/riotApi.js";
import { TeamBuilderService } from "./services/teamBuilder.js";

const config = loadConfig();
if (!config.riotApiKey) {
  console.warn("RIOT_API_KEY가 없어 웹 팀 편성판의 티어를 미조회 상태로 표시합니다.");
}
const repository = new SqliteRecruitmentRepository(config.databasePath);
const riotRankService = new RiotRankService({
  apiKey: config.riotApiKey,
  regionalRoute: config.riotRegionalRoute,
  platformRoute: config.riotPlatformRoute,
  cacheTtlMs: config.riotRankCacheMs,
});
const teamBuilderService = new TeamBuilderService(riotRankService, {
  baseUrl: config.teamBuilderBaseUrl,
  fixedMemberTag: config.memberRiotTag,
  callSize: config.callSize,
  sessionTtlMs: config.teamBuilderSessionTtlMs,
});
const bot = new BotController(repository, config, teamBuilderService);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} 수신: 봇을 종료합니다.`);
  await bot.stop();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await bot.start();
} catch (error) {
  console.error("봇 시작 실패", error);
  repository.close();
  process.exitCode = 1;
}
