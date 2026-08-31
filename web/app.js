import { comparePlayersByRank, formatRankLabel } from "./rankSort.js?v=6";
import { parseTeamBuilderSession } from "./sessionParser.js?v=6";

const SNAP_DISTANCE = 150;

const elements = {
  emptyState: document.querySelector("#emptyState"),
  emptyCode: document.querySelector("#emptyCode"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyDescription: document.querySelector("#emptyDescription"),
  workspace: document.querySelector("#workspace"),
  draftLayout: document.querySelector("#draftLayout") ?? document.querySelector(".draft-layout"),
  playerPool: document.querySelector("#playerPool"),
  poolCount: document.querySelector("#poolCount"),
  sortHigh: document.querySelector("#sortHigh"),
  sortLow: document.querySelector("#sortLow"),
  teamsGrid: document.querySelector("#teamsGrid"),
  excludedNote: document.querySelector("#excludedNote"),
  teamTemplate: document.querySelector("#teamTemplate"),
  playerTemplate: document.querySelector("#playerTemplate"),
  toast: document.querySelector("#toast"),
};

let session = null;
let players = [];
let cards = new Map();
let zones = new Map();
let dragState = null;
let toastTimer = null;

elements.sortHigh?.addEventListener("click", () => sortPlayerPool("high"));
elements.sortLow?.addEventListener("click", () => sortPlayerPool("low"));

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

  players = value.players.map((player, index) => ({
    ...player,
    id: `p${index + 1}`,
    position: index + 1,
  }));
  elements.playerPool.classList.toggle("multi-column", players.length > 10);

  buildTeamBoards(value);
  buildPlayerCards();
  fitQueueWidth();

  if (value.excludedCount > 0) {
    elements.excludedNote.hidden = false;
    elements.excludedNote.textContent = `선착순 기준 뒤의 ${value.excludedCount}명은 이번 편성 링크에서 제외됐습니다.`;
  }

  restoreLayout();
  updateBoard();
}

function buildTeamBoards(value) {
  for (let teamIndex = 0; teamIndex < 4; teamIndex += 1) {
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
    card.querySelector(".riot-id").textContent = `${player.riotName} #${player.riotTag}`;

    const rankLabel = card.querySelector(".rank-label");
    rankLabel.textContent = formatRankLabel(player);
    if (player.tier) rankLabel.dataset.tier = player.tier;
    rankLabel.title = rankTitle(player);
    card.setAttribute(
      "aria-label",
      `${player.position}번 ${player.riotName} #${player.riotTag}, ${formatRankLabel(player)}`,
    );
    card.addEventListener("pointerdown", startDrag);
    card.addEventListener("keydown", handleCardKeyboard);
    cards.set(player.id, card);
    elements.playerPool.append(card);
  }
}

function fitQueueWidth() {
  let cardWidth = 250;
  for (const card of cards.values()) {
    const riotIdWidth = card.querySelector(".riot-id").scrollWidth;
    const rankWidth = card.querySelector(".rank-label").scrollWidth;
    cardWidth = Math.max(cardWidth, Math.ceil(Math.max(riotIdWidth, rankWidth) + 24));
  }
  const columns = elements.playerPool.classList.contains("multi-column") ? 2 : 1;
  const requiredWidth = Math.max(340, cardWidth * columns + (columns - 1) * 6 + 30);
  elements.draftLayout.style.setProperty("--queue-panel-width", `${requiredWidth}px`);
}

function sortPlayerPool(direction) {
  if (dragState) return;
  const queueCards = [...elements.playerPool.querySelectorAll(":scope > .player-card")];
  queueCards.sort((left, right) =>
    comparePlayersByRank(
      playerById(left.dataset.playerId),
      playerById(right.dataset.playerId),
      direction,
    ),
  );
  elements.playerPool.append(...queueCards);
  saveLayout();
  showToast(`대기열을 티어 ${direction === "high" ? "높은 순" : "낮은 순"}으로 정렬했습니다.`);
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

function rankTitle(player) {
  if (player.status !== "RANKED") return formatRankLabel(player);
  return `${player.queue === "SOLO" ? "솔로 랭크" : "자유 랭크"} · ${formatRankLabel(player)}`;
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

async function readSession() {
  const encoded = new URLSearchParams(location.hash.slice(1)).get("s");
  if (!encoded) return null;
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("이 브라우저는 압축 세션을 지원하지 않습니다.");
  }
  const compressed = base64UrlToBytes(encoded);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const parsed = JSON.parse(await new Response(stream).text());
  return parseTeamBuilderSession(parsed);
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
