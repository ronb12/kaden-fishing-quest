const PLAYER_KEY = "kaden-vr-player-id";
let playerId = localStorage.getItem(PLAYER_KEY);
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem(PLAYER_KEY, playerId);
}

const API_BASE = "/api";
let syncTimer = null;
let cloudEnabled = true;

export function getPlayerId() {
  return playerId;
}

export async function loadCloudSave() {
  if (!cloudEnabled) return null;
  try {
    const res = await fetch(`${API_BASE}/progress?playerId=${encodeURIComponent(playerId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.found && data.save?.state) {
      return typeof data.save.state === "string" ? JSON.parse(data.save.state) : data.save.state;
    }
  } catch {
    /* offline — use local save */
  }
  return null;
}

export async function saveCloudSave(state) {
  if (!cloudEnabled) return false;
  try {
    const res = await fetch(`${API_BASE}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function scheduleCloudSave(state) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => saveCloudSave(state), 1200);
}

export async function fetchLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/leaderboard`);
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
