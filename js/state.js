import {
  DEFAULT_STATE,
  QUESTS,
  STORAGE_KEY,
  BAITS,
  getBait,
  isBaitUnlocked,
  GEAR_MAX,
  getGearCost,
  ZONES,
  canBoatTravelToZone,
} from "./data.js";
import { loadCloudSave, saveCloudSave, scheduleCloudSave } from "./api.js";
import { GUIDED_STEPS, stepForTrigger } from "./tutorial.js";

let state = loadLocal();
const listeners = new Set();
let cloudReady = false;
let syncStatus = "local";

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...DEFAULT_STATE, ...JSON.parse(raw) };
      if (!parsed.tutorial) parsed.tutorial = { ...DEFAULT_STATE.tutorial };
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_STATE };
}

export async function initState() {
  const local = { ...state };
  const cloud = await loadCloudSave();
  if (cloud) {
    const localTime = local.lastSaved || 0;
    const cloudTime = cloud.lastSaved || 0;
    state = cloudTime >= localTime ? { ...DEFAULT_STATE, ...cloud } : { ...DEFAULT_STATE, ...local };
    if (!state.selectedBait) state.selectedBait = "worm";
    if (!state.questProgress) state.questProgress = { ...DEFAULT_STATE.questProgress };
    if (!state.settings) state.settings = { ...DEFAULT_STATE.settings };
    if (!state.tutorial) state.tutorial = { ...DEFAULT_STATE.tutorial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
    syncStatus = "synced";
  }
  cloudReady = true;
  return state;
}

export function getState() {
  return state;
}

export function getSyncStatus() {
  return syncStatus;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  state.lastSaved = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
  if (cloudReady) {
    syncStatus = "saving";
    listeners.forEach((fn) => fn(state));
    scheduleCloudSave(state, (ok) => {
      syncStatus = ok ? "synced" : "offline";
      listeners.forEach((fn) => fn(state));
    });
  }
}

export function setDisplayName(name) {
  const trimmed = (name || "").trim().slice(0, 20);
  if (!trimmed) return { ok: false, message: "Enter a name (1–20 characters)." };
  state.displayName = trimmed;
  notify();
  return { ok: true, message: `Angler name set to ${trimmed}.` };
}

export function updateSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  notify();
}

export function setZone(zone) {
  state.zone = zone;
  if (zone === "North Cove") state.questProgress.visitedCove = true;
  notify();
}

export function setBait(baitId) {
  const bait = getBait(baitId);
  if (!isBaitUnlocked(bait, state.baitKit)) {
    return { ok: false, message: `Upgrade bait kit to use ${bait.name}.` };
  }
  state.selectedBait = baitId;
  notify();
  return { ok: true, message: `Equipped ${bait.name}.` };
}

export function getSelectedBait() {
  return getBait(state.selectedBait || "worm");
}

export function recordCatch(catchData) {
  const wasNew = !state.codex[catchData.speciesId];
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
  catchData.isNewSpecies = wasNew;
  if (catchData.zone === "Lake Dock") state.questProgress.lakeFish += 1;
  if (catchData.zone === "Deep Water") state.questProgress.deepWaterFish += 1;
  if (catchData.rarity === "rare" || catchData.rarity === "legendary") {
    state.questProgress.rareCatch = (state.questProgress.rareCatch || 0) + 1;
  }
  if (catchData.rarity === "legendary") {
    state.questProgress.legendaryCatch = (state.questProgress.legendaryCatch || 0) + 1;
  }
  notify();
  return catchData;
}

export function upgradeGear(type) {
  const max = GEAR_MAX[type];
  const current = type === "rod" ? state.rodLevel : type === "boat" ? state.boatLevel : state.baitKit;
  if (current >= max) return { ok: false, message: `${type} is max level (${max}).` };
  const cost = getGearCost(type, current);
  if (state.coins < cost) return { ok: false, message: `Need ${cost} coins.` };
  state.coins -= cost;
  if (type === "rod") {
    state.rodLevel += 1;
    if (state.rodLevel > 1) state.questProgress.rodUpgraded = true;
  }
  if (type === "boat") state.boatLevel += 1;
  if (type === "bait") state.baitKit += 1;
  notify();
  return { ok: true, message: `${type} upgraded to level ${current + 1}!` };
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
  const codexCount = Object.keys(state.codex).length;
  switch (quest.id) {
    case "lakeFish":
      return { current: p.lakeFish, target: quest.target };
    case "visitCove":
      return { current: p.visitedCove ? 1 : 0, target: 1 };
    case "rodUpgraded":
      return { current: p.rodUpgraded ? 1 : 0, target: 1 };
    case "rareCatch":
      return { current: p.rareCatch || 0, target: 1 };
    case "deepWaterFish":
      return { current: p.deepWaterFish || 0, target: quest.target };
    case "legendaryCatch":
      return { current: p.legendaryCatch || 0, target: 1 };
    case "codexHalf":
      return { current: codexCount, target: quest.target };
    default:
      return { current: 0, target: quest.target };
  }
}

export function canAccessZone(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) return false;
  if (state.boatLevel < zone.boatRequired) return false;
  if (zone.boatRequired >= 2 && !canBoatTravelToZone(state.boatLevel, zoneId)) return false;
  return true;
}

export async function resetProgress() {
  state = { ...DEFAULT_STATE };
  notify();
  await saveCloudSave(state);
}

export function isCloudReady() {
  return cloudReady;
}

function ensureTutorial() {
  if (!state.tutorial) state.tutorial = { ...DEFAULT_STATE.tutorial };
  if (!state.tutorial.tipsSeen) state.tutorial.tipsSeen = {};
}

export function getTutorial() {
  ensureTutorial();
  return state.tutorial;
}

export function setTutorialGuideSection(sectionId) {
  ensureTutorial();
  state.tutorial.guideSection = sectionId;
  notify();
}

export function advanceTutorialStep(nextStep) {
  ensureTutorial();
  if (state.tutorial.completed) return false;
  state.tutorial.step = Math.min(Math.max(0, nextStep), GUIDED_STEPS.length - 1);
  notify();
  return true;
}

export function advanceTutorialOnTrigger(trigger) {
  ensureTutorial();
  if (state.tutorial.completed || !state.tutorial.active) return false;
  const next = stepForTrigger(trigger, state.tutorial.step);
  if (next === state.tutorial.step) return false;
  state.tutorial.step = next;
  notify();
  return true;
}

export function completeTutorial() {
  ensureTutorial();
  state.tutorial.completed = true;
  state.tutorial.active = false;
  state.tutorial.step = GUIDED_STEPS.length - 1;
  notify();
}

export function skipTutorial() {
  completeTutorial();
}

export function restartTutorial() {
  ensureTutorial();
  state.tutorial.completed = false;
  state.tutorial.active = true;
  state.tutorial.step = 0;
  notify();
}

export function markTipSeen(tipId) {
  ensureTutorial();
  if (state.tutorial.tipsSeen[tipId]) return false;
  state.tutorial.tipsSeen[tipId] = true;
  notify();
  return true;
}

export function shouldShowTip(tipId) {
  ensureTutorial();
  return !state.tutorial.tipsSeen[tipId];
}
