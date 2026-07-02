import { DEFAULT_STATE, GEAR_COSTS, QUESTS, STORAGE_KEY } from "./data.js";
import { loadCloudSave, saveCloudSave, scheduleCloudSave } from "./api.js";

let state = loadLocal();
const listeners = new Set();
let cloudReady = false;

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_STATE };
}

export async function initState() {
  const cloud = await loadCloudSave();
  if (cloud) {
    state = { ...DEFAULT_STATE, ...cloud };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
  }
  cloudReady = true;
  return state;
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
  if (cloudReady) scheduleCloudSave(state);
}

export function setZone(zone) {
  state.zone = zone;
  if (zone === "North Cove") state.questProgress.visitedCove = true;
  notify();
}

export function recordCatch(catchData) {
  state.fish += 1;
  state.coins += catchData.value;
  state.totalWeight += catchData.weight;
  if (!state.bestCatch || catchData.weight > state.bestCatch.weight) {
    state.bestCatch = catchData;
  }
  const entry = state.codex[catchData.speciesId];
  if (entry) {
    entry.count += 1;
    entry.bestWeight = Math.max(entry.bestWeight, catchData.weight);
  } else {
    state.codex[catchData.speciesId] = {
      name: catchData.name,
      rarity: catchData.rarity,
      count: 1,
      bestWeight: catchData.weight,
      firstZone: catchData.zone,
    };
  }
  if (catchData.zone === "Lake Dock") state.questProgress.lakeFish += 1;
  if (catchData.rarity === "rare" || catchData.rarity === "legendary") {
    state.questProgress.rareCatch = (state.questProgress.rareCatch || 0) + 1;
  }
  notify();
  return catchData;
}

export function upgradeGear(type) {
  const cost = GEAR_COSTS[type];
  if (state.coins < cost) return { ok: false, message: `Need ${cost} coins.` };
  state.coins -= cost;
  if (type === "rod") {
    state.rodLevel += 1;
    if (state.rodLevel > 1) state.questProgress.rodUpgraded = true;
  }
  if (type === "boat") state.boatLevel += 1;
  if (type === "bait") state.baitKit += 1;
  notify();
  return { ok: true, message: `${type} upgraded!` };
}

export function claimQuest(questId) {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest || state.claimedQuests?.includes(questId)) return null;
  const progress = getQuestProgress(quest);
  if (progress.current < progress.target) return null;
  if (!state.claimedQuests) state.claimedQuests = [];
  state.claimedQuests.push(questId);
  state.coins += quest.reward;
  notify();
  return quest.reward;
}

export function getQuestProgress(quest) {
  const p = state.questProgress;
  switch (quest.id) {
    case "lakeFish":
      return { current: p.lakeFish, target: quest.target };
    case "visitCove":
      return { current: p.visitedCove ? 1 : 0, target: 1 };
    case "rodUpgraded":
      return { current: p.rodUpgraded ? 1 : 0, target: 1 };
    case "rareCatch":
      return { current: p.rareCatch || 0, target: 1 };
    default:
      return { current: 0, target: quest.target };
  }
}

export function canAccessZone(zoneId) {
  const zone = { "Lake Dock": 1, "North Cove": 1, "Deep Water": 2 }[zoneId];
  return state.boatLevel >= (zone || 1);
}

export async function resetProgress() {
  state = { ...DEFAULT_STATE };
  notify();
  await saveCloudSave(state);
}

export function isCloudReady() {
  return cloudReady;
}
