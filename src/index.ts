import { loadConfig } from "./config.js";
import { SqliteRecruitmentRepository } from "./db/sqliteRepository.js";
import { BotController } from "./discord/BotController.js";

const config = loadConfig();
const repository = new SqliteRecruitmentRepository(config.databasePath);
const bot = new BotController(repository, config);

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
