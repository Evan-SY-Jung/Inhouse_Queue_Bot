import { REST, Routes } from "discord.js";
import { loadConfig } from "./config.js";
import { applicationCommands } from "./discord/commands.js";

const config = loadConfig();
const rest = new REST({ version: "10" }).setToken(config.token);
const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body: applicationCommands });
console.log(
  config.guildId
    ? `테스트 서버 ${config.guildId}에 /내전 세팅 명령어를 등록했습니다.`
    : "전역 /내전 세팅 명령어를 등록했습니다.",
);
