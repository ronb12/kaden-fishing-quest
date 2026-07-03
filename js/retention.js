import { DAILY_CHALLENGES, CODEX_MILESTONES, QUEST_CHAINS, FISH_SPECIES } from "./data.js";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function ensureRetentionState(state) {
  if (!state.daily) {
    state.daily = { date: "", progress: {}, claimed: false, streak: 0, lastPlayDate: "" };
  }
  if (!state.trophies) state.trophies = [];
  if (!state.questChainProgress) state.questChainProgress = {};
  if (!state.claimedCodexRewards) state.claimedCodexRewards = [];
  if (!state.claimedChainRewards) state.claimedChainRewards = [];
  return state;
}

export function refreshDailyChallenges(state) {
  ensureRetentionState(state);
  const today = todayKey();
  if (state.daily.date === today) return state;

  const last = state.daily.lastPlayDate;
  if (last === yesterdayKey()) state.daily.streak = (state.daily.streak || 0) + 1;
  else if (last && last !== today) state.daily.streak = 1;
  else if (!last) state.daily.streak = 1;

  state.daily.date = today;
  state.daily.lastPlayDate = today;
  state.daily.claimed = false;
  state.daily.zonesToday = [];
  state.daily.progress = {};
  for (const c of DAILY_CHALLENGES) state.daily.progress[c.id] = 0;
  return state;
}

export function bumpDailyProgress(state, id, amount = 1) {
  refreshDailyChallenges(state);
  if (!state.daily.progress[id]) state.daily.progress[id] = 0;
  state.daily.progress[id] += amount;
}

export function getDailyChallengeStatus(state) {
  refreshDailyChallenges(state);
  return DAILY_CHALLENGES.map((c) => {
    const current = state.daily.progress[c.id] || 0;
    return { ...c, current, done: current >= c.target };
  });
}

export function allDailiesComplete(state) {
  return getDailyChallengeStatus(state).every((c) => c.done);
}

export function claimDailyReward(state) {
  refreshDailyChallenges(state);
  if (state.daily.claimed) return null;
  if (!allDailiesComplete(state)) return null;
  const streakBonus = Math.min(50, (state.daily.streak || 1) * 5);
  const reward = 25 + streakBonus;
  state.daily.claimed = true;
  state.coins += reward;
  return reward;
}

export function addTrophy(state, catchData) {
  ensureRetentionState(state);
  const existing = state.trophies.find((t) => t.speciesId === catchData.speciesId);
  if (existing) {
    if (catchData.weight > existing.weight) {
      existing.weight = catchData.weight;
      existing.name = catchData.name;
      existing.rarity = catchData.rarity;
    }
    return false;
  }
  state.trophies.push({
    speciesId: catchData.speciesId,
    name: catchData.name,
    weight: catchData.weight,
    rarity: catchData.rarity,
  });
  return true;
}

export function getCodexMilestoneStatus(state) {
  const count = Object.keys(state.codex || {}).length;
  return CODEX_MILESTONES.map((m) => ({
    ...m,
    current: count,
    done: count >= m.target,
    claimed: state.claimedCodexRewards?.includes(m.id),
  }));
}

export function claimCodexMilestone(state, id) {
  const milestone = CODEX_MILESTONES.find((m) => m.id === id);
  if (!milestone || state.claimedCodexRewards?.includes(id)) return null;
  const count = Object.keys(state.codex || {}).length;
  if (count < milestone.target) return null;
  state.claimedCodexRewards.push(id);
  state.coins += milestone.reward;
  return milestone.reward;
}

export function getQuestChainStatus(state) {
  ensureRetentionState(state);
  return QUEST_CHAINS.map((chain) => {
    const stepIndex = state.questChainProgress[chain.id] || 0;
    const step = chain.steps[stepIndex];
    const done = stepIndex >= chain.steps.length;
    let current = 0;
    if (step && !done) current = evaluateChainStep(state, step);
    return { ...chain, stepIndex, step, done, current, target: step?.target ?? 0 };
  });
}

function evaluateChainStep(state, step) {
  const p = state.questProgress || {};
  switch (step.type) {
    case "lakeFish":
      return p.lakeFish || 0;
    case "visitCove":
      return p.visitedCove ? 1 : 0;
    case "visitMoonlit":
      return p.visitedMoonlit ? 1 : 0;
    case "rareCatch":
      return p.rareCatch || 0;
    case "legendaryCatch":
      return p.legendaryCatch || 0;
    case "codex":
      return Object.keys(state.codex || {}).length;
    case "deepWaterFish":
      return p.deepWaterFish || 0;
    default:
      return 0;
  }
}

export function advanceQuestChains(state) {
  ensureRetentionState(state);
  let advanced = false;
  for (const chain of QUEST_CHAINS) {
    let idx = state.questChainProgress[chain.id] || 0;
    while (idx < chain.steps.length) {
      const step = chain.steps[idx];
      const current = evaluateChainStep(state, step);
      if (current < step.target) break;
      idx += 1;
      advanced = true;
    }
    state.questChainProgress[chain.id] = idx;
  }
  return advanced;
}

export function claimQuestChainReward(state, chainId) {
  const chain = QUEST_CHAINS.find((c) => c.id === chainId);
  if (!chain || state.claimedChainRewards?.includes(chainId)) return null;
  const idx = state.questChainProgress[chainId] || 0;
  if (idx < chain.steps.length) return null;
  state.claimedChainRewards.push(chainId);
  state.coins += chain.reward;
  return chain.reward;
}

export function getRadioReport(state) {
  const hour = new Date().getHours();
  const isNight = hour >= 18 || hour < 6;
  const zone = state.zone || "Lake Dock";
  const speciesHere = FISH_SPECIES.filter((f) => f.zones.includes(zone));
  const hot = speciesHere[Math.floor(Math.random() * speciesHere.length)];
  const lines = [
    isNight
      ? "🌙 Moonlit Cove is active — night species are feeding."
      : "☀️ Clear skies over the lake — panfish are schooling near the dock.",
    hot ? `📻 Hot bite: ${hot.name} reported in ${zone}.` : "📻 Calm conditions — try varying your bait depth.",
  ];
  if ((state.questChainProgress?.legendaryHunt || 0) >= 2) {
    lines.push("⚡ Legendary hunt active — heavy lures in Deep Water after dusk.");
  }
  if (state.daily?.streak > 2) {
    lines.push(`🔥 ${state.daily.streak}-day angler streak — daily bonus boosted!`);
  }
  return lines.join("\n");
}

export function isLegendaryHuntActive(state) {
  return (state.questChainProgress?.legendaryHunt || 0) >= 2;
}
