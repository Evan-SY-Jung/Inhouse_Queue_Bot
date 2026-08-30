const SESSION_VERSION = 2;
const LEGACY_SESSION_VERSION = 1;
const SNAP_DISTANCE = 150;
const TIER_ORDER = [
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
];
const DIVISION_SCORE = { IV: 0, III: 100, II: 200, I: 300 };

const elements = {
  emptyState: document.querySelector("#emptyState"),
  emptyCode: document.querySelector("#emptyCode"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyDescription: document.querySelector("#emptyDescription"),
  workspace: document.querySelector("#workspace"),
  commandActions: document.querySelector("#commandActions"),
  playerPool: document.querySelector("#playerPool"),
  poolCount: document.querySelector("#poolCount"),
  teamsGrid: document.querySelector("#teamsGrid"),
  excludedNote: document.querySelector("#excludedNote"),
  teamTemplate: document.querySelector("#teamTemplate"),
  playerTemplate: document.querySelector("#playerTemplate"),
  balanceButton: document.querySelector("#balanceButton"),
  randomButton: document.querySelector("#randomButton"),
  resetButton: document.querySelector("#resetButton"),
  copyButton: document.querySelector("#copyButton"),
  toast: document.querySelector("#toast"),
};

let session = null;
let players = [];
let cards = new Map();
let zones = new Map();
let dragState = null;
let toastTimer = null;

try {
  session = await readSession();
  if (!session) {
    showEmpty(
      "NO SESSION",
      "Discord에서 팀 짜기 버튼을 눌러 주세요",
      "이 페이지는 봇이 만든 전용 링크로 열 때 참가자와 Riot 티어를 불러옵니다. API 키와 Discord 토큰은 링크나 브라우저로 전달되지 않습니다.",
    );
  } else if (Date.now() >= session.expiresAt * 1_000) {
    showEmpty(
      "SESSION EXPIRED",
      "팀 편성 링크가 만료됐습니다",
      "Discord 모집 채널로 돌아가 팀 짜기 버튼을 다시 눌러 새 링크를 만들어 주세요.",
    );
  } else {
    initializeWorkspace(session);
  }
} catch (error) {
  console.error(error);
  showEmpty(
    "INVALID SESSION",
    "팀 편성 정보를 열지 못했습니다",
    "링크가 잘렸거나 지원하지 않는 형식입니다. Discord에서 팀 짜기 버튼을 다시 눌러 주세요.",
  );
}

function initializeWorkspace(value) {
  elements.emptyState.hidden = true;
  elements.workspace.hidden = false;
  elements.commandActions.hidden = false;

  players = value.players.map((player, index) => ({
    ...player,
    id: `p${index + 1}`,
    position: index + 1,
    score: rankScore(player),
  }));

  buildTeamBoards(value);
  buildPlayerCards();

  if (value.excludedCount > 0) {
    elements.excludedNote.hidden = false;
    elements.excludedNote.textContent = `선착순 기준 뒤의 ${value.excludedCount}명은 이번 편성 링크에서 제외됐습니다.`;
  }

  elements.balanceButton.addEventListener("click", autoBalance);
  elements.randomButton.addEventListener("click", randomizeTeams);
  elements.resetButton.addEventListener("click", resetToPool);
  elements.copyButton.addEventListener("click", copyDiscordResult);

  if (!restoreLayout()) autoBalance(false);
  updateBoard();
}

function buildTeamBoards(value) {
  const gameSize = value.teamSize * 2;
  const teamCount = Math.ceil(value.players.length / gameSize) * 2;
  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const teamNumber = teamIndex + 1;
    const panel = elements.teamTemplate.content.firstElementChild.cloneNode(true);
    const gameNumber = Math.floor(teamIndex / 2) + 1;
    const side = teamIndex % 2 === 0 ? "blue" : "red";
    const zoneId = `g${gameNumber}-${side}`;
    const zone = panel.querySelector(".team-drop");

    panel.dataset.team = String(teamNumber);
    panel.querySelector(".team-number").textContent = String(teamNumber);
    panel.querySelector(".team-title").textContent = `${teamNumber}번 팀`;
    zone.dataset.zoneId = zoneId;
    zone.dataset.max = String(value.teamSize);
    zone.dataset.side = side;
    zone.setAttribute("aria-label", `${teamNumber}번 팀`);
    zones.set(zoneId, zone);
    elements.teamsGrid.append(panel);
  }
  zones.set("pool", elements.playerPool);
}

function buildPlayerCards() {
  for (const player of players) {
    const card = elements.playerTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.playerId = player.id;
    card.querySelector(".display-name").textContent = player.displayName;
    card.querySelector(".riot-id").textContent = `${player.riotName} #${player.riotTag}`;

    const avatar = card.querySelector(".discord-avatar");
    const avatarFallback = card.querySelector(".avatar-fallback");
    avatarFallback.textContent = avatarInitial(player.displayName);
    const avatarSource = discordAvatarUrl(player);
    if (avatarSource) {
      avatar.src = avatarSource;
      avatar.addEventListener("error", () => avatar.removeAttribute("src"), { once: true });
    }

    const badge = card.querySelector(".rank-badge");
    badge.textContent = formatRank(player);
    if (player.tier) badge.dataset.tier = player.tier;
    badge.title = rankTitle(player);
    card.setAttribute(
      "aria-label",
      `${player.position}번 ${player.displayName}, ${player.riotName} #${player.riotTag}, ${formatRank(player)}`,
    );
    card.addEventListener("pointerdown", startDrag);
    card.addEventListener("keydown", handleCardKeyboard);
    cards.set(player.id, card);
    elements.playerPool.append(card);
  }
}

function autoBalance(showMessage = true) {
  moveAllToPool();
  const gameSize = session.teamSize * 2;
  const knownScores = players
    .map((player) => player.score)
    .filter((score) => score !== null)
    .sort((left, right) => left - right);
  const fallbackScore = knownScores.length
    ? knownScores[Math.floor(knownScores.length / 2)]
    : 0;

  const gameCount = Math.ceil(players.length / gameSize);
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const group = players
      .slice(gameIndex * gameSize, (gameIndex + 1) * gameSize)
      .sort(
        (left, right) =>
          (right.score ?? fallbackScore) - (left.score ?? fallbackScore),
      );
    const blue = [];
    const red = [];
    let blueScore = 0;
    let redScore = 0;
    const blueTarget = Math.ceil(group.length / 2);
    const redTarget = Math.floor(group.length / 2);
    for (const player of group) {
      const score = player.score ?? fallbackScore;
      if (
        blue.length < blueTarget &&
        (red.length >= redTarget || blueScore <= redScore)
      ) {
        blue.push(player);
        blueScore += score;
      } else {
        red.push(player);
        redScore += score;
      }
    }
    appendPlayers(`g${gameIndex + 1}-blue`, blue);
    appendPlayers(`g${gameIndex + 1}-red`, red);
  }
  updateBoard();
  saveLayout();
  if (showMessage) showToast("티어 점수를 기준으로 팀 균형을 맞췄습니다.");
}

function randomizeTeams() {
  moveAllToPool();
  const gameSize = session.teamSize * 2;
  const gameCount = Math.ceil(players.length / gameSize);
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const group = shuffle(players.slice(gameIndex * gameSize, (gameIndex + 1) * gameSize));
    const blueCount = Math.ceil(group.length / 2);
    appendPlayers(`g${gameIndex + 1}-blue`, group.slice(0, blueCount));
    appendPlayers(`g${gameIndex + 1}-red`, group.slice(blueCount));
  }
  updateBoard();
  saveLayout();
  showToast("선착순 경기 단위로 팀을 무작위 배치했습니다.");
}

function resetToPool() {
  moveAllToPool();
  updateBoard();
  saveLayout();
  showToast("모든 이름표를 대기열로 되돌렸습니다.");
}

function appendPlayers(zoneId, values) {
  const zone = zones.get(zoneId);
  for (const player of values) zone.append(cards.get(player.id));
}

function moveAllToPool() {
  for (const player of players) elements.playerPool.append(cards.get(player.id));
}

function startDrag(event) {
  if (event.button !== 0 || dragState) return;
  event.preventDefault();
  const card = event.currentTarget;
  const sourceZone = card.closest(".drop-zone");
  const rect = card.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "card-placeholder";
  placeholder.style.height = `${rect.height}px`;
  card.after(placeholder);

  dragState = {
    card,
    sourceZone,
    placeholder,
    targetZone: sourceZone,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };

  document.body.append(card);
  Object.assign(card.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  card.classList.add("dragging");
  card.setAttribute("aria-grabbed", "true");
  document.addEventListener("pointermove", moveDrag);
  document.addEventListener("pointerup", finishDrag, { once: true });
  document.addEventListener("pointercancel", cancelDrag, { once: true });
  moveDrag(event);
}

function moveDrag(event) {
  if (!dragState) return;
  dragState.card.style.left = `${event.clientX - dragState.offsetX}px`;
  dragState.card.style.top = `${event.clientY - dragState.offsetY}px`;

  const target = nearestZone(event.clientX, event.clientY);
  for (const zone of zones.values()) {
    zone.classList.toggle("magnet-target", zone === target);
    zone.classList.toggle("zone-full", zone !== elements.playerPool && !canAccept(zone));
  }
  dragState.targetZone = target ?? dragState.sourceZone;
}

function finishDrag(event) {
  if (!dragState) return;
  let target = dragState.targetZone ?? dragState.sourceZone;
  if (!canAccept(target)) {
    target = dragState.sourceZone;
    showToast("한 팀에는 정해진 인원까지만 넣을 수 있습니다.");
  }

  const { card, placeholder } = dragState;
  placeholder.remove();
  resetDraggedCard(card);
  insertAtPointer(target, card, event.clientY);
  target.classList.add("snap-pulse");
  setTimeout(() => target.classList.remove("snap-pulse"), 300);
  clearDragState();
  updateBoard();
  saveLayout();
}

function cancelDrag() {
  if (!dragState) return;
  const { card, sourceZone, placeholder } = dragState;
  placeholder.replaceWith(card);
  resetDraggedCard(card);
  sourceZone.classList.add("snap-pulse");
  clearDragState();
  updateBoard();
}

function resetDraggedCard(card) {
  card.classList.remove("dragging");
  card.removeAttribute("aria-grabbed");
  card.removeAttribute("style");
}

function clearDragState() {
  document.removeEventListener("pointermove", moveDrag);
  document.removeEventListener("pointercancel", cancelDrag);
  for (const zone of zones.values()) {
    zone.classList.remove("magnet-target", "zone-full");
  }
  dragState = null;
}

function nearestZone(x, y) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones.values()) {
    const rect = zone.getBoundingClientRect();
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance && distance <= SNAP_DISTANCE) {
      best = zone;
      bestDistance = distance;
    }
  }
  return best;
}

function canAccept(zone) {
  if (!zone || zone.dataset.unlimited === "true") return true;
  const max = Number(zone.dataset.max);
  return zone.querySelectorAll(":scope > .player-card").length < max;
}

function insertAtPointer(zone, card, pointerY) {
  const siblings = [...zone.querySelectorAll(":scope > .player-card")];
  const next = siblings.find((sibling) => {
    const rect = sibling.getBoundingClientRect();
    return pointerY < rect.top + rect.height / 2;
  });
  zone.insertBefore(card, next ?? null);
}

function handleCardKeyboard(event) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const card = event.currentTarget;
  const zoneIds = [...zones.keys()];
  const currentId = card.closest(".drop-zone")?.dataset.zoneId ?? "pool";
  const direction = event.key === "ArrowRight" ? 1 : -1;
  let index = zoneIds.indexOf(currentId);

  for (let attempts = 0; attempts < zoneIds.length; attempts += 1) {
    index = (index + direction + zoneIds.length) % zoneIds.length;
    const target = zones.get(zoneIds[index]);
    if (canAccept(target)) {
      target.append(card);
      updateBoard();
      saveLayout();
      showToast(`${target.getAttribute("aria-label") ?? "대기열"}로 이동했습니다.`);
      card.focus();
      return;
    }
  }
}

function updateBoard() {
  elements.poolCount.textContent = String(
    elements.playerPool.querySelectorAll(":scope > .player-card").length,
  );

  for (const panel of elements.teamsGrid.querySelectorAll(".team-panel")) {
    const count = panel.querySelectorAll(".team-drop > .player-card").length;
    panel.querySelector(".team-count").textContent = `${count} / ${session.teamSize}`;
  }
}

function avatarInitial(displayName) {
  return [...displayName.trim()][0]?.toLocaleUpperCase("ko-KR") ?? "?";
}

function discordAvatarUrl(player) {
  if (!player.userId || !player.avatarRef) return null;
  const kind = player.avatarRef[0];
  const value = player.avatarRef.slice(1);
  if (kind === "d") {
    return `https://cdn.discordapp.com/embed/avatars/${value}.png`;
  }
  if (kind === "u") {
    return `https://cdn.discordapp.com/avatars/${player.userId}/${value}.webp?size=128`;
  }
  if (kind === "g" && session.guildId) {
    return `https://cdn.discordapp.com/guilds/${session.guildId}/users/${player.userId}/avatars/${value}.webp?size=128`;
  }
  return null;
}

function rankScore(player) {
  if (player.status !== "RANKED" || !player.tier) return null;
  const tierIndex = TIER_ORDER.indexOf(player.tier);
  if (tierIndex < 0) return null;
  return (
    tierIndex * 400 +
    (DIVISION_SCORE[player.division] ?? 300) +
    (player.leaguePoints ?? 0)
  );
}

function formatRank(player) {
  if (player.status === "RANKED") {
    const division = player.division ? ` ${player.division}` : "";
    const points = player.leaguePoints === null ? "" : ` ${player.leaguePoints}LP`;
    return `${player.tier}${division}${points}`;
  }
  if (player.status === "UNRANKED") return "UNRANKED";
  if (player.status === "NOT_FOUND") return "ID 확인";
  if (player.status === "API_UNAVAILABLE") return "API 미설정";
  return "조회 실패";
}

function rankTitle(player) {
  if (player.status !== "RANKED") return formatRank(player);
  return `${player.queue === "SOLO" ? "솔로 랭크" : "자유 랭크"} · ${formatRank(player)}`;
}

async function copyDiscordResult() {
  const lines = ["# ⚔️ CR 내전 팀 편성 결과"];
  for (const panel of elements.teamsGrid.querySelectorAll(".team-panel")) {
    const teamNumber = panel.dataset.team;
    lines.push("", `## ${teamNumber}번 팀`);
    const teamCards = [...panel.querySelectorAll(".team-drop > .player-card")];
    teamCards.forEach((card, index) => {
      const player = playerById(card.dataset.playerId);
      lines.push(
        `${index + 1}. ${escapeDiscord(player.displayName)} · ${escapeDiscord(player.riotName)} #${escapeDiscord(player.riotTag)} · ${formatRank(player)}`,
      );
    });
    const emptySlots = session.teamSize - teamCards.length;
    if (emptySlots > 0) lines.push(`-# 빈자리 ${emptySlots}명`);
  }
  const poolCards = [...elements.playerPool.querySelectorAll(":scope > .player-card")];
  if (poolCards.length > 0) {
    lines.push("", "## 미배정 대기열");
    poolCards.forEach((card, index) => {
      const player = playerById(card.dataset.playerId);
      lines.push(
        `${index + 1}. ${escapeDiscord(player.displayName)} · ${escapeDiscord(player.riotName)} #${escapeDiscord(player.riotTag)} · ${formatRank(player)}`,
      );
    });
  }
  if (session.excludedCount > 0) {
    lines.push("", `-# 후순위 ${session.excludedCount}명은 이번 편성에서 제외`);
  }

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = lines.join("\n");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("Discord용 팀 편성 결과를 복사했습니다.");
}

function escapeDiscord(value) {
  return value.replace(/([\\*_~`>|])/g, "\\$1").replaceAll("@", "@\u200b");
}

function saveLayout() {
  try {
    const assignments = {};
    for (const [zoneId, zone] of zones) {
      for (const card of zone.querySelectorAll(":scope > .player-card")) {
        assignments[card.dataset.playerId] = zoneId;
      }
    }
    sessionStorage.setItem(storageKey(), JSON.stringify(assignments));
  } catch {
    // 시크릿 모드 등에서 저장이 막혀도 현재 편성은 계속 사용할 수 있습니다.
  }
}

function restoreLayout() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return false;
    const assignments = JSON.parse(raw);
    const counts = new Map();
    for (const player of players) {
      const zoneId = assignments[player.id];
      if (typeof zoneId !== "string" || !zones.has(zoneId)) return false;
      counts.set(zoneId, (counts.get(zoneId) ?? 0) + 1);
      const zone = zones.get(zoneId);
      if (zone.dataset.unlimited !== "true" && counts.get(zoneId) > Number(zone.dataset.max)) {
        return false;
      }
    }
    for (const player of players) zones.get(assignments[player.id]).append(cards.get(player.id));
    return true;
  } catch {
    return false;
  }
}

function storageKey() {
  return `cr-team-layout:${session.recruitmentId}:${session.generatedAt}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2_400);
}

function showEmpty(code, title, description) {
  elements.workspace.hidden = true;
  elements.commandActions.hidden = true;
  elements.emptyState.hidden = false;
  elements.emptyCode.textContent = code;
  elements.emptyTitle.textContent = title;
  elements.emptyDescription.textContent = description;
}

function playerById(id) {
  const player = players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("참가자 정보를 찾을 수 없습니다.");
  return player;
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

async function readSession() {
  const encoded = new URLSearchParams(location.hash.slice(1)).get("s");
  if (!encoded) return null;
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("이 브라우저는 압축 세션을 지원하지 않습니다.");
  }
  const compressed = base64UrlToBytes(encoded);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const parsed = JSON.parse(await new Response(stream).text());
  return parseSession(parsed);
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseSession(value) {
  if (!Array.isArray(value)) {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }
  const version = value[0];
  let recruitmentId;
  let gameCode;
  let guildId;
  let generatedAt;
  let expiresAt;
  let teamSize;
  let excludedCount;
  let rows;

  if (version === SESSION_VERSION && value.length === 9) {
    [
      ,
      recruitmentId,
      gameCode,
      guildId,
      generatedAt,
      expiresAt,
      teamSize,
      excludedCount,
      rows,
    ] = value;
  } else if (version === LEGACY_SESSION_VERSION && value.length === 8) {
    [, recruitmentId, gameCode, generatedAt, expiresAt, teamSize, excludedCount, rows] = value;
    guildId = "";
  } else {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }

  if (
    !Number.isInteger(recruitmentId) ||
    !["R", "A"].includes(gameCode) ||
    (version === SESSION_VERSION && !/^\d{17,20}$/.test(guildId)) ||
    !Number.isInteger(generatedAt) ||
    !Number.isInteger(expiresAt) ||
    !Number.isInteger(teamSize) ||
    teamSize < 1 ||
    !Number.isInteger(excludedCount) ||
    excludedCount < 0 ||
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > teamSize * 4
  ) {
    throw new Error("팀 편성 세션 값이 올바르지 않습니다.");
  }
  return {
    version,
    recruitmentId,
    gameType: gameCode === "R" ? "RIFT" : "ARAM",
    guildId,
    generatedAt,
    expiresAt,
    teamSize,
    excludedCount,
    players: rows.map((row) => parsePlayer(row, version)),
  };
}

function parsePlayer(row, version) {
  const expectedLength = version === SESSION_VERSION ? 10 : 8;
  if (!Array.isArray(row) || row.length !== expectedLength) {
    throw new Error("참가자 데이터가 올바르지 않습니다.");
  }
  const [
    displayName,
    compactRiotName,
    riotTag,
    statusCode,
    queueCode,
    tier,
    division,
    points,
    userId = "",
    avatarRef = "",
  ] = row;
  if (
    typeof displayName !== "string" ||
    displayName.length > 40 ||
    typeof compactRiotName !== "string" ||
    compactRiotName.length > 32 ||
    typeof riotTag !== "string" ||
    riotTag.length > 10 ||
    !["R", "U", "N", "K", "E"].includes(statusCode) ||
    !["S", "F", ""].includes(queueCode) ||
    typeof tier !== "string" ||
    typeof division !== "string" ||
    !Number.isFinite(points) ||
    (version === SESSION_VERSION && !/^\d{17,20}$/.test(userId)) ||
    (version === SESSION_VERSION &&
      !(/^[gu](?:a_)?[a-f0-9]{32}$/.test(avatarRef) || /^d[0-5]$/.test(avatarRef)))
  ) {
    throw new Error("참가자 값이 올바르지 않습니다.");
  }
  return {
    displayName,
    riotName: compactRiotName || displayName,
    riotTag,
    userId,
    avatarRef,
    status: { R: "RANKED", U: "UNRANKED", N: "NOT_FOUND", K: "API_UNAVAILABLE", E: "API_ERROR" }[
      statusCode
    ],
    queue: queueCode === "S" ? "SOLO" : queueCode === "F" ? "FLEX" : null,
    tier: tier || null,
    division: division || null,
    leaguePoints: points >= 0 ? points : null,
  };
}
