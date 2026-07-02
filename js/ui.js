import { FISH_SPECIES, GEAR_COSTS, QUESTS, ZONES } from "./data.js";
import {
  getState,
  subscribe,
  setZone,
  upgradeGear,
  claimQuest,
  canAccessZone,
  resetProgress,
} from "./state.js";

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
      case "quests":
        panelContent.innerHTML = renderQuests(state);
        break;
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
      </ul>
      <p class="help-tip">Cast into the lake, wait for a bite, hook fast, then reel while managing tension.</p>
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
        <div><strong>Bait Kit ${state.baitKit}</strong><span>Faster bites, better odds</span></div>
        <button data-upgrade="bait">Upgrade (${GEAR_COSTS.bait}c)</button>
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
    showCatch(catchData) {
      if (!catchOverlay) return;
      catchOverlay.innerHTML = `
        <div class="catch-card rarity-${catchData.rarity}">
          <p class="catch-label">Caught!</p>
          <h2>${catchData.name}</h2>
          <p>${catchData.weight} lb · ${catchData.rarity}</p>
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
  };
}
