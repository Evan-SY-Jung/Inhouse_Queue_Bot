const SESSION_VERSION = 1;
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
  sessionSummary: document.querySelector("#sessionSummary"),
  gameBadge: document.querySelector("#gameBadge"),
  queueBadge: document.querySelector("#queueBadge"),
  expiryBadge: document.querySelector("#expiryBadge"),
  playerCount: document.querySelector("#playerCount"),
  lookupSummary: document.querySelector("#lookupSummary"),
  playerPool: document.querySelector("#playerPool"),
  poolCount: document.querySelector("#poolCount"),
  gamesColumn: document.querySelector("#gamesColumn"),
  excludedNote: document.querySelector("#excludedNote"),
  gameTemplate: document.querySelector("#gameTemplate"),
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
  elements.sessionSummary.hidden = false;
  elements.gameBadge.textContent = value.gameType === "RIFT" ? "협곡" : "아람";
  elements.queueBadge.textContent = `모집 #${value.recruitmentId}`;
  elements.playerCount.textContent = String(value.players.length);

  players = value.players.map((player, index) => ({
    ...player,
    id: `p${index + 1}`,
    position: index + 1,
    score: rankScore(player),
  }));

  buildGameBoards(value);
  buildPlayerCards();
  updateExpiry();
  setInterval(updateExpiry, 30_000);

  const ranked = players.filter((player) => player.status === "RANKED").length;
  const unranked = players.filter((player) => player.status === "UNRANKED").length;
  const unavailable = players.length - ranked - unranked;
  elements.lookupSummary.textContent = `랭크 ${ranked}명 · 언랭 ${unranked}명 · 미조회 ${unavailable}명`;

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

function buildGameBoards(value) {
  const gameSize = value.teamSize * 2;
  const gameCount = value.players.length / gameSize;
  for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
    const board = elements.gameTemplate.content.firstElementChild.cloneNode(true);
    board.dataset.game = String(gameIndex + 1);
    board.querySelector(".game-title").textContent = `${gameIndex + 1}경기`;

    for (const side of ["blue", "red"]) {
      const zone = board.querySelector(`[data-side="${side}"]`);
      const zoneId = `g${gameIndex + 1}-${side}`;
      zone.dataset.zoneId = zoneId;
      zone.dataset.max = String(value.teamSize);
      zone.setAttribute(
        "aria-label",
        `${gameIndex + 1}경기 ${side === "blue" ? "블루" : "레드"}팀`,
      );
      zones.set(zoneId, zone);
    }
    elements.gamesColumn.append(board);
  }
  zones.set("pool", elements.playerPool);
}

function buildPlayerCards() {
  for (const player of players) {
    const card = elements.playerTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.playerId = player.id;
    card.querySelector(".queue-position").textContent = String(player.position).padStart(2, "0");
    card.querySelector(".display-name").textContent = player.displayName;
    card.querySelector(".riot-id").textContent = `${player.riotName} #${player.riotTag}`;

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

  for (let gameIndex = 0; gameIndex < players.length / gameSize; gameIndex += 1) {
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
    for (const player of group) {
      const score = player.score ?? fallbackScore;
      if (
        blue.length < session.teamSize &&
        (red.length >= session.teamSize || blueScore <= redScore)
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
  for (let gameIndex = 0; gameIndex < players.length / gameSize; gameIndex += 1) {
    const group = shuffle(players.slice(gameIndex * gameSize, (gameIndex + 1) * gameSize));
    appendPlayers(`g${gameIndex + 1}-blue`, group.slice(0, session.teamSize));
    appendPlayers(`g${gameIndex + 1}-red`, group.slice(session.teamSize));
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

  for (const board of elements.gamesColumn.querySelectorAll(".game-board")) {
    const blueZone = board.querySelector('[data-side="blue"]');
    const redZone = board.querySelector('[data-side="red"]');
    const blueCards = [...blueZone.querySelectorAll(":scope > .player-card")];
    const redCards = [...redZone.querySelectorAll(":scope > .player-card")];
    board.querySelector(".game-status").textContent =
      `${blueCards.length + redCards.length} / ${session.teamSize * 2}`;
    board.querySelector(".team-blue .team-score").textContent = teamScoreLabel(blueCards);
    board.querySelector(".team-red .team-score").textContent = teamScoreLabel(redCards);
  }
}

function teamScoreLabel(teamCards) {
  const scores = teamCards
    .map((card) => playerById(card.dataset.playerId).score)
    .filter((score) => score !== null);
  if (!scores.length) return "전력 —";
  return `전력 ${Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)}`;
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
  const incomplete = [...zones.entries()]
    .filter(([zoneId]) => zoneId !== "pool")
    .some(([, zone]) => zone.querySelectorAll(":scope > .player-card").length !== session.teamSize);
  if (incomplete) {
    showToast("모든 팀을 정원까지 채운 뒤 결과를 복사해 주세요.");
    return;
  }

  const lines = ["# ⚔️ CR 내전 팀 편성 결과"];
  for (const board of elements.gamesColumn.querySelectorAll(".game-board")) {
    const gameNumber = board.dataset.game;
    lines.push("", `## ${gameNumber}경기`);
    for (const [side, label] of [
      ["blue", "🔵 블루팀"],
      ["red", "🔴 레드팀"],
    ]) {
      lines.push(`**${label}**`);
      const teamCards = board.querySelectorAll(`[data-side="${side}"] > .player-card`);
      teamCards.forEach((card, index) => {
        const player = playerById(card.dataset.playerId);
        lines.push(
          `${index + 1}. ${escapeDiscord(player.displayName)} · ${escapeDiscord(player.riotName)} #${escapeDiscord(player.riotTag)} · ${formatRank(player)}`,
        );
      });
    }
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

function updateExpiry() {
  const seconds = Math.max(0, session.expiresAt - Math.floor(Date.now() / 1_000));
  if (seconds <= 0) {
    elements.expiryBadge.textContent = "링크 만료";
    return;
  }
  const minutes = Math.ceil(seconds / 60);
  elements.expiryBadge.textContent = minutes >= 60
    ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음`
    : `${minutes}분 남음`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2_400);
}

function showEmpty(code, title, description) {
  elements.workspace.hidden = true;
  elements.sessionSummary.hidden = true;
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
  if (!Array.isArray(value) || value.length !== 8 || value[0] !== SESSION_VERSION) {
    throw new Error("지원하지 않는 팀 편성 세션입니다.");
  }
  const [, recruitmentId, gameCode, generatedAt, expiresAt, teamSize, excludedCount, rows] = value;
  if (
    !Number.isInteger(recruitmentId) ||
    !["R", "A"].includes(gameCode) ||
    !Number.isInteger(generatedAt) ||
    !Number.isInteger(expiresAt) ||
    !Number.isInteger(teamSize) ||
    teamSize < 1 ||
    !Number.isInteger(excludedCount) ||
    excludedCount < 0 ||
    !Array.isArray(rows) ||
    rows.length < teamSize * 2 ||
    rows.length > teamSize * 4 ||
    rows.length % (teamSize * 2) !== 0
  ) {
    throw new Error("팀 편성 세션 값이 올바르지 않습니다.");
  }
  return {
    version: SESSION_VERSION,
    recruitmentId,
    gameType: gameCode === "R" ? "RIFT" : "ARAM",
    generatedAt,
    expiresAt,
    teamSize,
    excludedCount,
    players: rows.map(parsePlayer),
  };
}

function parsePlayer(row) {
  if (!Array.isArray(row) || row.length !== 8) {
    throw new Error("참가자 데이터가 올바르지 않습니다.");
  }
  const [displayName, compactRiotName, riotTag, statusCode, queueCode, tier, division, points] = row;
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
    !Number.isFinite(points)
  ) {
    throw new Error("참가자 값이 올바르지 않습니다.");
  }
  return {
    displayName,
    riotName: compactRiotName || displayName,
    riotTag,
    status: { R: "RANKED", U: "UNRANKED", N: "NOT_FOUND", K: "API_UNAVAILABLE", E: "API_ERROR" }[
      statusCode
    ],
    queue: queueCode === "S" ? "SOLO" : queueCode === "F" ? "FLEX" : null,
    tier: tier || null,
    division: division || null,
    leaguePoints: points >= 0 ? points : null,
  };
}
