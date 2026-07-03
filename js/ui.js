import { FISH_SPECIES, GEAR_COSTS, QUESTS, ZONES, BAITS, isBaitUnlocked } from "./data.js";
import { getState, subscribe, setZone, upgradeGear, claimQuest, canAccessZone, resetProgress, setBait, getSelectedBait } from "./state.js";
import { fetchLeaderboard, getPlayerId } from "./api.js";

let activePanel = "hud";

export function initUI(fishing, callbacks) {
  const hud = document.getElementById("hud");
  const menu = document.getElementById("vr-menu");
  const toast = document.getElementById("toast");
  const enterVrBtn = document.getElementById("enterVrBtn");
  const panelContent = document.getElementById("panel-content");
  const tensionBar = document.getElementById("tension-bar");
  const tensionFill = document.getElementById("tension-fill");
  const reelProgress = document.getElementById("reel-progress");
  const statusText = document.getElementById("status-text");
  const catchOverlay = document.getElementById("catch-overlay");
  const biteAlert = document.getElementById("bite-alert");
  const biteSpecies = document.getElementById("bite-species");
  const biteTimerFill = document.getElementById("bite-timer-fill");
  const reelAlert = document.getElementById("reel-alert");

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function renderHUD(state) {
    document.getElementById("hud-fish").textContent = state.fish;
    document.getElementById("hud-coins").textContent = state.coins;
    document.getElementById("hud-rod").textContent = state.rodLevel;
    document.getElementById("hud-zone").textContent = state.zone;
    document.getElementById("hud-boat").textContent = state.boatLevel;
    const bait = getSelectedBait();
    const baitEl = document.getElementById("hud-bait");
    if (baitEl) baitEl.textContent = `${bait.icon} ${bait.name}`;
  }

  function renderPanel(state) {
    if (!panelContent) return;
    switch (activePanel) {
      case "zones":
        panelContent.innerHTML = renderZones(state);
        break;
      case "codex":
        panelContent.innerHTML = renderCodex(state);
        break;
      case "gear":
        panelContent.innerHTML = renderGear(state);
        break;
      case "bait":
        panelContent.innerHTML = renderBait(state);
        break;
      case "quests":
        panelContent.innerHTML = renderQuests(state);
        break;
      case "leaderboard":
        renderLeaderboard();
        return;
      default:
        panelContent.innerHTML = renderHelp();
    }
    bindPanelEvents();
  }

  function renderHelp() {
    return `
      <h3>VR Controls</h3>
      <ul class="help-list">
        <li><strong>Right Trigger</strong> — Cast / Hook / Reel</li>
        <li><strong>Menu buttons</strong> — Zones, Codex, Gear, Quests</li>
        <li><strong>Teleport rings</strong> — Walk to colored rings in-world</li>
      </ul>
      <h3>Desktop Controls</h3>
      <ul class="help-list">
        <li><strong>Space</strong> — Cast / Hook</li>
        <li><strong>Hold R</strong> — Reel in</li>
        <li><strong>Mouse</strong> — Look around</li>
        <li><strong>WASD</strong> — Move</li>
        <li><strong>1–3</strong> — Switch zones</li>
        <li><strong>B</strong> — Bait menu · <strong>4–9</strong> — Quick-select bait</li>
      </ul>
      <h3>Touch / iPhone</h3>
      <ul class="help-list">
        <li><strong>Drag right side</strong> — Look around</li>
        <li><strong>Left joystick</strong> — Move</li>
        <li><strong>Cast / HOOK!</strong> — Tap action button</li>
        <li><strong>Hold Reel</strong> — After hooking a fish</li>
        <li><strong>🪱 Bait</strong> — Open bait picker</li>
      </ul>
      <p class="help-tip">Cast, wait for the bobber to dunk and a fish to strike, press Space/trigger to HOOK, then hold R/trigger to REEL while watching tension.</p>
    `;
  }

  function renderZones(state) {
    return Object.values(ZONES)
      .map((z) => {
        const locked = !canAccessZone(z.id);
        return `
          <button class="panel-btn ${state.zone === z.id ? "active" : ""} ${locked ? "locked" : ""}"
            data-zone="${z.id}" ${locked ? "disabled" : ""}>
            <strong>${z.label}</strong>
            <span>${locked ? `Requires Boat Lvl ${z.boatRequired}` : z.description}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderCodex(state) {
    const entries = Object.entries(state.codex);
    if (!entries.length) {
      return `<p class="empty">No fish logged yet. Cast a line to start your codex!</p>`;
    }
    return entries
      .map(([id, e]) => {
        const species = FISH_SPECIES.find((f) => f.id === id);
        return `
          <div class="codex-entry rarity-${e.rarity}">
            <strong>${e.name}</strong>
            <span>${e.count} caught · Best ${e.bestWeight} lb · ${e.rarity}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderGear(state) {
    return `
      <div class="gear-row">
        <div><strong>Rod Lvl ${state.rodLevel}</strong><span>+${state.rodLevel * 2} coin bonus</span></div>
        <button data-upgrade="rod">Upgrade (${GEAR_COSTS.rod}c)</button>
      </div>
      <div class="gear-row">
        <div><strong>Boat Lvl ${state.boatLevel}</strong><span>Unlocks deep water</span></div>
        <button data-upgrade="boat">Upgrade (${GEAR_COSTS.boat}c)</button>
      </div>
      <div class="gear-row">
        <div><strong>Bait Kit ${state.baitKit}</strong><span>Unlocks advanced baits</span></div>
        <button data-upgrade="bait">Upgrade (${GEAR_COSTS.bait}c)</button>
      </div>
    `;
  }

  function renderBait(state) {
    return `
      <p class="help-tip">Choose bait before casting. Each type attracts different fish.</p>
      <div class="bait-grid">
        ${BAITS.map((b) => {
          const unlocked = isBaitUnlocked(b, state.baitKit);
          const active = state.selectedBait === b.id;
          return `
            <button class="bait-card ${active ? "active" : ""} ${unlocked ? "" : "locked"}"
              data-bait="${b.id}" ${unlocked ? "" : "disabled"}>
              <span class="bait-icon">${b.icon}</span>
              <strong>${b.name}</strong>
              <span class="bait-desc">${unlocked ? b.description : `Requires Bait Kit Lvl ${b.unlockLevel}`}</span>
              ${active ? '<span class="bait-equipped">Equipped</span>' : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQuests(state) {
    return QUESTS.map((q) => {
      const { current, target } = (() => {
        const p = state.questProgress;
        switch (q.id) {
          case "lakeFish": return { current: p.lakeFish, target: q.target };
          case "visitCove": return { current: p.visitedCove ? 1 : 0, target: 1 };
          case "rodUpgraded": return { current: p.rodUpgraded ? 1 : 0, target: 1 };
          case "rareCatch": return { current: p.rareCatch || 0, target: 1 };
          default: return { current: 0, target: q.target };
        }
      })();
      const done = current >= target;
      const claimed = state.claimedQuests?.includes(q.id);
      return `
        <div class="quest-row ${done ? "done" : ""}">
          <div>
            <strong>${q.label}</strong>
            <span>${Math.min(current, target)}/${target} · Reward ${q.reward}c</span>
          </div>
          ${done && !claimed ? `<button data-claim="${q.id}">Claim</button>` : claimed ? "<span class='claimed'>Claimed</span>" : ""}
        </div>
      `;
    }).join("");
  }

  async function renderLeaderboard() {
    panelContent.innerHTML = `<p class="empty">Loading leaderboard...</p>`;
    const rows = await fetchLeaderboard();
    if (!rows.length) {
      panelContent.innerHTML = `<p class="empty">No anglers on the board yet. Be the first!</p>`;
      return;
    }
    panelContent.innerHTML = `
      <p class="help-tip">Synced via Neon · Your ID: ${getPlayerId().slice(0, 8)}…</p>
      ${rows.map((r, i) => `
        <div class="leaderboard-row">
          <span class="rank">#${i + 1}</span>
          <div>
            <strong>${r.display_name || r.player_id.slice(0, 8)}</strong>
            <span>${r.fish_count} fish · ${r.coins} coins</span>
          </div>
        </div>
      `).join("")}
    `;
  }

  function bindPanelEvents() {
    panelContent?.querySelectorAll("[data-zone]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const zone = btn.dataset.zone;
        if (canAccessZone(zone)) {
          setZone(zone);
          callbacks.onZoneChange?.(zone);
          showToast(`Moved to ${zone}`);
        }
      });
    });
    panelContent?.querySelectorAll("[data-upgrade]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const result = upgradeGear(btn.dataset.upgrade);
        showToast(result.ok ? result.message : result.message);
        if (result.ok && btn.dataset.upgrade === "rod") {
          callbacks.onRodUpgrade?.();
        }
      });
    });
    panelContent?.querySelectorAll("[data-bait]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const result = setBait(btn.dataset.bait);
        showToast(result.message);
        if (result.ok) callbacks.onBaitChange?.();
      });
    });
    panelContent?.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reward = claimQuest(btn.dataset.claim);
        if (reward) showToast(`Quest complete! +${reward} coins`);
      });
    });
  }

  document.querySelectorAll("[data-panel]").forEach((tab) => {
    tab.addEventListener("click", () => {
      activePanel = tab.dataset.panel;
      document.querySelectorAll("[data-panel]").forEach((t) =>
        t.classList.toggle("active", t.dataset.panel === activePanel)
      );
      renderPanel(getState());
    });
  });

  document.getElementById("resetBtn")?.addEventListener("click", () => {
    if (confirm("Reset all progress?")) {
      resetProgress();
      showToast("Progress reset.");
    }
  });

  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    menu?.classList.toggle("open");
    if (menu?.classList.contains("open")) renderPanel(getState());
  });

  enterVrBtn?.addEventListener("click", () => callbacks.onEnterVR?.());

  subscribe((state) => {
    renderHUD(state);
    if (menu?.classList.contains("open")) renderPanel(state);
  });

  renderHUD(getState());
  renderPanel(getState());

  return {
    showToast,
    setStatus(text) {
      if (statusText) statusText.textContent = text;
    },
    setTension(tension, progress, visible) {
      if (tensionBar) tensionBar.classList.toggle("visible", visible);
      if (tensionFill) tensionFill.style.width = `${tension * 100}%`;
      if (reelProgress) reelProgress.style.width = `${progress * 100}%`;
    },
    setBiteAlert(visible, speciesName, timerProgress = 1) {
      biteAlert?.classList.toggle("visible", visible);
      reelAlert?.classList.toggle("visible", false);
      if (speciesName && biteSpecies) biteSpecies.textContent = speciesName;
      if (biteTimerFill) biteTimerFill.style.width = `${timerProgress * 100}%`;
    },
    setReelAlert(visible) {
      reelAlert?.classList.toggle("visible", visible);
      biteAlert?.classList.toggle("visible", false);
    },
    showCatch(catchData) {
      if (!catchOverlay) return;
      catchOverlay.innerHTML = `
        <div class="catch-card rarity-${catchData.rarity}">
          <p class="catch-label">Caught!</p>
          <h2>${catchData.name}</h2>
          <p>${catchData.weight} lb · ${catchData.rarity}${catchData.baitUsed ? ` · ${catchData.baitUsed}` : ""}</p>
          <p class="catch-value">+${catchData.value} coins</p>
        </div>
      `;
      catchOverlay.classList.add("show");
      setTimeout(() => catchOverlay.classList.remove("show"), 2400);
    },
    toggleMenu() {
      menu?.classList.toggle("open");
      if (menu?.classList.contains("open")) renderPanel(getState());
    },
    openPanel(name) {
      activePanel = name;
      document.querySelectorAll("[data-panel]").forEach((t) =>
        t.classList.toggle("active", t.dataset.panel === activePanel)
      );
      menu?.classList.add("open");
      renderPanel(getState());
    },
  };
}
