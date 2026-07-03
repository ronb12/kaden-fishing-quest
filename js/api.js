const PLAYER_KEY = "kaden-vr-player-id";
let playerId = localStorage.getItem(PLAYER_KEY);
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem(PLAYER_KEY, playerId);
}

const API_BASE = "/api";
let syncTimer = null;
let cloudEnabled = true;

const FETCH_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getPlayerId() {
  return playerId;
}

export async function loadCloudSave() {
  if (!cloudEnabled) return null;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/progress?playerId=${encodeURIComponent(playerId)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    if (data.found && data.save?.state) {
      const state = typeof data.save.state === "string" ? JSON.parse(data.save.state) : data.save.state;
      if (data.save.updated_at) state.lastSaved = new Date(data.save.updated_at).getTime();
      return state;
    }
  } catch {
    /* offline — use local save */
  }
  return null;
}

export async function saveCloudSave(state) {
  if (!cloudEnabled) return false;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        state,
        displayName: state.displayName || null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function scheduleCloudSave(state, onComplete) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const ok = await saveCloudSave(state);
    onComplete?.(ok);
  }, 1200);
}

export async function fetchLeaderboard(sort = "fish") {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/leaderboard?sort=${encodeURIComponent(sort)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.leaderboard || [];
  } catch {
    return [];
  }
}

export function setCloudEnabled(on) {
  cloudEnabled = on;
}

export function isCloudEnabled() {
  return cloudEnabled;
}
