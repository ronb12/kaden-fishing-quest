import {
  FISH_SPECIES,
  QUESTS,
  ZONES,
  BAITS,
  isBaitUnlocked,
  GEAR_MAX,
  getGearCost,
  getBoatDescription,
  getBaitKitDescription,
} from "./data.js";
import {
  getState,
  subscribe,
  setZone,
  upgradeGear,
  claimQuest,
  canAccessZone,
  resetProgress,
  setBait,
  getSelectedBait,
  setDisplayName,
  updateSettings,
  getSyncStatus,
  getTutorial,
  setTutorialGuideSection,
  advanceTutorialOnTrigger,
  advanceTutorialStep,
  completeTutorial,
  skipTutorial,
  restartTutorial,
  markTipSeen,
  shouldShowTip,
} from "./state.js";
import { fetchLeaderboard, getPlayerId } from "./api.js";
import * as audio from "./audio.js";
import { tensionZone } from "./fish-fight.js";
import { getRodStats, baitStatsLine } from "./gear-stats.js";
import {
  GUIDED_STEPS,
  GUIDE_SECTIONS,
  CONTEXTUAL_TIPS,
  getGuidedStepBody,
} from "./tutorial.js";
import { renderCodexHTML, bindFishCardEvents, getSpeciesCatchTip, renderFishFieldGuideHTML } from "./fish-guide.js";

let activePanel = "guide";
let guideView = "walkthrough";
let leaderboardSort = "fish";

export function initUI(fishing, callbacks) {
  const hud = document.getElementById("hud");
  const menu = document.getElementById("vr-menu");
  const toast = document.getElementById("toast");
  const syncIndicator = document.getElementById("sync-indicator");
  const panelContent = document.getElementById("panel-content");
  const tensionBar = document.getElementById("tension-bar");
  const tensionFill = document.getElementById("tension-fill");
  const reelProgress = document.getElementById("reel-progress");
  const statusText = document.getElementById("status-text");
  const catchOverlay = document.getElementById("catch-overlay");
  const biteAlert = document.getElementById("bite-alert");
  const biteSpecies = document.getElementById("bite-species");
  const biteTimerFill = document.getElementById("bite-timer-fill");
  const biteAlertAction = document.querySelector(".bite-alert-action");
  const reelAlert = document.getElementById("reel-alert");
  const reelHint = document.querySelector(".reel-hint");
  const fightPhaseHint = document.getElementById("fight-phase-hint");
  const tensionZoneLabel = document.getElementById("tension-zone-label");
  const tutorialOverlay = document.getElementById("tutorial-overlay");
  const tutorialTitle = document.getElementById("tutorial-title");
  const tutorialBody = document.getElementById("tutorial-body");
  const tutorialStepLabel = document.getElementById("tutorial-step-label");
  const tutorialNextBtn = document.getElementById("tutorial-next");
  const tutorialSkipBtn = document.getElementById("tutorial-skip");
  const tipBanner = document.getElementById("tip-banner");
  const tipBannerTitle = document.getElementById("tip-banner-title");
  const tipBannerText = document.getElementById("tip-banner-text");
  const tipBannerClose = document.getElementById("tip-banner-close");
  let tipBannerTimer = null;
  let lastTensionZoneTip = null;

  function inputMode() {
    if (document.body.classList.contains("touch-mode")) return "touch";
    if (callbacks.isVR?.()) return "vr";
    return "desktop";
  }

  function biteActionText() {
    switch (inputMode()) {
      case "touch": return "Tap HOOK now!";
      case "vr": return "Jerk rod up or pull trigger!";
      default: return "Press Space or click HOOK!";
    }
  }

  function reelHintText() {
    switch (inputMode()) {
      case "touch": return "Hold Reel in the green zone — ease off during runs";
      case "vr": return "Crank left hand in a circle on the reel — ease off during runs";
      default: return "Hold R to reel in the green zone — ease off during runs";
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function updateSyncStatus() {
    if (!syncIndicator) return;
    const status = getSyncStatus();
    syncIndicator.textContent =
      status === "synced" ? "☁ Saved" : status === "saving" ? "☁ Saving…" : status === "offline" ? "☁ Offline" : "☁ Local";
    syncIndicator.className = `sync-indicator sync-${status}`;
  }

  function renderHUD(state) {
    document.getElementById("hud-fish").textContent = state.fish;
    document.getElementById("hud-coins").textContent = state.coins;
    const rod = getRodStats(state.rodLevel);
    document.getElementById("hud-rod").textContent = `${rod.name}`;
    document.getElementById("hud-zone").textContent = state.zone;
    document.getElementById("hud-boat").textContent = state.boatLevel;
    const bait = getSelectedBait();
    const baitEl = document.getElementById("hud-bait");
    if (baitEl) baitEl.textContent = `${bait.icon} ${bait.name}`;
    updateSyncStatus();
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
      case "settings":
        panelContent.innerHTML = renderSettings(state);
        break;
      case "leaderboard":
        renderLeaderboard();
        return;
      case "leaderboard":
        renderLeaderboard();
        return;
      case "guide":
        panelContent.innerHTML = renderGuide(state);
        break;
      default:
        panelContent.innerHTML = renderGuide(state);
    }
    bindPanelEvents();
  }

  function renderGuide(state) {
    const tut = getTutorial();
    const section = GUIDE_SECTIONS.find((s) => s.id === tut.guideSection) || GUIDE_SECTIONS[0];
    const step = GUIDED_STEPS[tut.step] || GUIDED_STEPS[0];
    const platform = inputMode();
    const walkthroughActive = tut.active && !tut.completed;

    const sectionNav = GUIDE_SECTIONS.map(
      (s) => `<button type="button" class="guide-tab ${s.id === section.id ? "active" : ""}" data-guide-section="${s.id}">${s.icon} ${s.title}</button>`
    ).join("");

    const walkthroughPanel = `
      <div class="guide-walkthrough">
        <div class="guide-walkthrough-header">
          <h3>Interactive Walkthrough</h3>
          ${tut.completed ? '<span class="guide-badge done">Completed</span>' : '<span class="guide-badge">In progress</span>'}
        </div>
        <p class="help-tip">${walkthroughActive ? "Follow the on-screen cards while you play. Steps advance automatically as you fish." : "Replay the guided tour anytime."}</p>
        <div class="walkthrough-progress">
          ${GUIDED_STEPS.map((s, i) => `<span class="walkthrough-dot ${i < tut.step ? "done" : ""} ${i === tut.step && walkthroughActive ? "current" : ""}" title="${s.title}"></span>`).join("")}
        </div>
        <p><strong>${step.title}</strong></p>
        <p class="guide-step-preview">${getGuidedStepBody(step, platform)}</p>
        <div class="guide-walkthrough-actions">
          ${walkthroughActive
            ? `<button type="button" class="panel-btn" data-tutorial-resume>Resume walkthrough</button>
               <button type="button" class="panel-btn" data-tutorial-skip>Skip walkthrough</button>`
            : `<button type="button" class="panel-btn" data-tutorial-restart>Start walkthrough</button>`}
        </div>
      </div>
    `;

    const sectionContent = section.id === "fish-guide"
      ? renderFishFieldGuideHTML()
      : section.content;

    return `
      <div class="guide-nav">${sectionNav}</div>
      ${walkthroughPanel}
      <div class="guide-section-content">
        <h3>${section.icon} ${section.title}</h3>
        ${sectionContent}
      </div>
    `;
  }

  function showContextualTip(tipKey) {
    const tip = CONTEXTUAL_TIPS[tipKey];
    if (!tip || !shouldShowTip(tip.id)) return;
    markTipSeen(tip.id);
    if (tipBannerTitle) tipBannerTitle.textContent = tip.title || "Tip";
    if (tipBannerText) tipBannerText.textContent = tip.text;
    tipBanner?.classList.add("show");
    clearTimeout(tipBannerTimer);
    tipBannerTimer = setTimeout(() => tipBanner?.classList.remove("show"), 6500);
  }

  function showSpeciesCatchTip(speciesId) {
    const tip = getSpeciesCatchTip(speciesId);
    if (!tip || !shouldShowTip(tip.id)) return;
    markTipSeen(tip.id);
    if (tipBannerTitle) tipBannerTitle.textContent = tip.title;
    if (tipBannerText) tipBannerText.textContent = tip.text;
    tipBanner?.classList.add("show");
    clearTimeout(tipBannerTimer);
    tipBannerTimer = setTimeout(() => tipBanner?.classList.remove("show"), 8000);
  }

  function refreshTutorialOverlay() {
    const tut = getTutorial();
    if (!tutorialOverlay) return;
    if (!tut.active || tut.completed) {
      tutorialOverlay.classList.remove("show");
      tutorialOverlay.setAttribute("aria-hidden", "true");
      return;
    }
    const step = GUIDED_STEPS[tut.step] || GUIDED_STEPS[0];
    const platform = inputMode();
    const body = getGuidedStepBody(step, platform);
    if (tutorialTitle) tutorialTitle.textContent = step.title;
    if (tutorialBody) tutorialBody.innerHTML = body || "";
    if (tutorialStepLabel) {
      tutorialStepLabel.textContent = `Step ${tut.step + 1} of ${GUIDED_STEPS.length}`;
    }
    if (tutorialNextBtn) {
      const needsAction = step.advanceOn && tut.step < GUIDED_STEPS.length - 1;
      tutorialNextBtn.textContent = needsAction ? "Waiting…" : tut.step >= GUIDED_STEPS.length - 1 ? "Finish" : "Next";
      tutorialNextBtn.disabled = Boolean(needsAction);
    }
    tutorialOverlay.classList.add("show");
    tutorialOverlay.setAttribute("aria-hidden", "false");
  }

  function tutorialNext() {
    const tut = getTutorial();
    const step = GUIDED_STEPS[tut.step];
    if (step?.advanceOn && tut.step < GUIDED_STEPS.length - 1) return;
    if (tut.step >= GUIDED_STEPS.length - 1) {
      completeTutorial();
      refreshTutorialOverlay();
      showToast("Tutorial complete — tight lines!");
      return;
    }
    advanceTutorialStep(tut.step + 1);
    refreshTutorialOverlay();
  }

  function onTutorialTrigger(trigger) {
    if (advanceTutorialOnTrigger(trigger)) {
      refreshTutorialOverlay();
    }
  }

  function checkTensionTip(zone, phase) {
    if (zone === "warning" || zone === "snap") {
      if (lastTensionZoneTip !== "warning") {
        lastTensionZoneTip = "warning";
        showContextualTip("tension_warning");
      }
      return;
    }
    if (zone === "sweet" && phase === "tired") {
      if (lastTensionZoneTip !== "sweet") {
        lastTensionZoneTip = "sweet";
        showContextualTip("tension_sweet");
      }
      return;
    }
    if (phase === "run" || phase === "surge" || phase === "thrash") {
      if (lastTensionZoneTip !== "run") {
        lastTensionZoneTip = "run";
        showContextualTip("phase_run");
      }
      return;
    }
    if (phase === "tired") {
      if (lastTensionZoneTip !== "tired") {
        lastTensionZoneTip = "tired";
        showContextualTip("phase_tired");
      }
    }
  }

  tipBannerClose?.addEventListener("click", () => tipBanner?.classList.remove("show"));
  tutorialNextBtn?.addEventListener("click", () => {
    audio.playUIClick();
    tutorialNext();
  });
  tutorialSkipBtn?.addEventListener("click", () => {
    audio.playUIClick();
    skipTutorial();
    refreshTutorialOverlay();
    showToast("Tutorial skipped — open Guide anytime from the menu.");
  });

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
    return renderCodexHTML(state);
  }

  function renderGear(state) {
    const rodMax = state.rodLevel >= GEAR_MAX.rod;
    const boatMax = state.boatLevel >= GEAR_MAX.boat;
    const baitMax = state.baitKit >= GEAR_MAX.bait;
    const rod = getRodStats(state.rodLevel);
    const castPct = Math.round((rod.castMult - 0.85) * 100);
    const linePct = Math.round((rod.lineStrength - 0.88) * 100);
    const reelPct = Math.round((rod.reelMult - 0.85) * 100);
    return `
      <div class="gear-row">
        <div>
          <strong>${rod.name}${rodMax ? " (MAX)" : ""}</strong>
          <span class="gear-tagline">${rod.tagline}</span>
          <span>${rod.action} action · +${castPct}% cast · +${linePct}% line · +${reelPct}% reel · +${Math.round(rod.fightControl * 100)}% fight control</span>
        </div>
        <button data-upgrade="rod" ${rodMax ? "disabled" : ""}>${rodMax ? "Maxed" : `Upgrade (${getGearCost("rod", state.rodLevel)}c)`}</button>
      </div>
      <div class="gear-row">
        <div><strong>Boat Lvl ${state.boatLevel}${boatMax ? " (MAX)" : ""}</strong><span>${getBoatDescription(state.boatLevel)}</span></div>
        <button data-upgrade="boat" ${boatMax ? "disabled" : ""}>${boatMax ? "Maxed" : `Upgrade (${getGearCost("boat", state.boatLevel)}c)`}</button>
      </div>
      <div class="gear-row">
        <div><strong>Bait Kit ${state.baitKit}${baitMax ? " (MAX)" : ""}</strong><span>${getBaitKitDescription(state.baitKit)}</span></div>
        <button data-upgrade="bait" ${baitMax ? "disabled" : ""}>${baitMax ? "Maxed" : `Upgrade (${getGearCost("bait", state.baitKit)}c)`}</button>
      </div>
    `;
  }

  function renderBait(state) {
    return `
      <p class="help-tip">Choose bait before casting. Float baits wait for nibbles; lures need rod motion to attract strikes.</p>
      <div class="bait-grid">
        ${BAITS.map((b) => {
          const unlocked = isBaitUnlocked(b, state.baitKit);
          const active = state.selectedBait === b.id;
          const stats = unlocked ? baitStatsLine(b) : "";
          return `
            <button class="bait-card ${active ? "active" : ""} ${unlocked ? "" : "locked"}"
              data-bait="${b.id}" ${unlocked ? "" : "disabled"}>
              <span class="bait-icon">${b.icon}</span>
              <strong>${b.name}</strong>
              <span class="bait-desc">${unlocked ? b.description : `Requires Bait Kit Lvl ${b.unlockLevel}`}</span>
              ${stats ? `<span class="bait-stats">${stats}</span>` : ""}
              ${active ? '<span class="bait-equipped">Equipped</span>' : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderQuests(state) {
    return QUESTS.map((q) => {
      const p = state.questProgress;
      const codexCount = Object.keys(state.codex).length;
      let current = 0;
      switch (q.id) {
        case "lakeFish": current = p.lakeFish; break;
        case "visitCove": current = p.visitedCove ? 1 : 0; break;
        case "rodUpgraded": current = p.rodUpgraded ? 1 : 0; break;
        case "rareCatch": current = p.rareCatch || 0; break;
        case "deepWaterFish": current = p.deepWaterFish || 0; break;
        case "legendaryCatch": current = p.legendaryCatch || 0; break;
        case "codexHalf": current = codexCount; break;
      }
      const done = current >= q.target;
      const claimed = state.claimedQuests?.includes(q.id);
      return `
        <div class="quest-row ${done ? "done" : ""}">
          <div>
            <strong>${q.label}</strong>
            <span>${Math.min(current, q.target)}/${q.target} · Reward ${q.reward}c</span>
          </div>
          ${done && !claimed ? `<button data-claim="${q.id}">Claim</button>` : claimed ? "<span class='claimed'>Claimed</span>" : ""}
        </div>
      `;
    }).join("");
  }

  function renderSettings(state) {
    const s = state.settings || {};
    return `
      <div class="settings-section">
        <label>Angler name (leaderboard)</label>
        <div class="settings-row">
          <input id="display-name-input" type="text" maxlength="20" placeholder="Your name" value="${state.displayName || ""}" />
          <button id="save-name-btn" type="button">Save</button>
        </div>
      </div>
      <div class="settings-section">
        <label class="settings-toggle">
          <input type="checkbox" data-setting="music" ${s.music !== false ? "checked" : ""} />
          Ambient lake audio
        </label>
        <label class="settings-toggle">
          <input type="checkbox" data-setting="sfx" ${s.sfx !== false ? "checked" : ""} />
          Sound effects
        </label>
      </div>
      <div class="settings-section">
        <label>Graphics quality</label>
        <select id="quality-select">
          <option value="high" ${s.quality !== "low" ? "selected" : ""}>High</option>
          <option value="low" ${s.quality === "low" ? "selected" : ""}>Low (mobile)</option>
        </select>
      </div>
      <p class="help-tip">Player ID: ${getPlayerId().slice(0, 8)}…</p>
    `;
  }

  async function renderLeaderboard() {
    panelContent.innerHTML = `
      <div class="leaderboard-tabs">
        <button class="lb-tab ${leaderboardSort === "fish" ? "active" : ""}" data-lb-sort="fish">Fish</button>
        <button class="lb-tab ${leaderboardSort === "coins" ? "active" : ""}" data-lb-sort="coins">Coins</button>
        <button class="lb-tab ${leaderboardSort === "weight" ? "active" : ""}" data-lb-sort="weight">Best Catch</button>
        <button class="lb-tab ${leaderboardSort === "codex" ? "active" : ""}" data-lb-sort="codex">Codex</button>
      </div>
      <p class="empty">Loading leaderboard...</p>
    `;
    panelContent.querySelectorAll("[data-lb-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        leaderboardSort = btn.dataset.lbSort;
        renderLeaderboard();
      });
    });
    const rows = await fetchLeaderboard(leaderboardSort);
    if (!rows.length) {
      panelContent.querySelector(".empty").textContent = "No anglers on the board yet. Be the first!";
      return;
    }
    const sortLabel = { fish: "fish", coins: "coins", weight: "lb best", codex: "species" };
    panelContent.querySelector(".empty")?.remove();
    const list = document.createElement("div");
    list.innerHTML = rows
      .map((r, i) => {
        const name = r.display_name || r.player_id?.slice(0, 8) || "Angler";
        let detail = `${r.fish_count} fish · ${r.coins} coins`;
        if (leaderboardSort === "weight" && r.best_catch) {
          detail = `${r.best_catch.name || "Fish"} · ${r.best_catch.weight} lb`;
        }
        if (leaderboardSort === "codex" && r.codex_count != null) {
          detail = `${r.codex_count} species logged`;
        }
        return `
          <div class="leaderboard-row">
            <span class="rank">#${i + 1}</span>
            <div>
              <strong>${name}</strong>
              <span>${detail}</span>
            </div>
          </div>
        `;
      })
      .join("");
    panelContent.appendChild(list);
  }

  function bindPanelEvents() {
    panelContent?.querySelectorAll("[data-zone]").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playUIClick();
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
        audio.playUIClick();
        const result = upgradeGear(btn.dataset.upgrade);
        showToast(result.ok ? result.message : result.message);
        if (result.ok) {
          audio.playUpgrade();
          if (btn.dataset.upgrade === "rod") callbacks.onRodUpgrade?.();
        }
      });
    });
    panelContent?.querySelectorAll("[data-bait]").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playUIClick();
        const result = setBait(btn.dataset.bait);
        showToast(result.message);
        if (result.ok) callbacks.onBaitChange?.();
      });
    });
    panelContent?.querySelectorAll("[data-claim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reward = claimQuest(btn.dataset.claim);
        if (reward) {
          audio.playQuestComplete();
          showToast(`Quest complete! +${reward} coins`);
        }
      });
    });
    panelContent?.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.setting;
        updateSettings({ [key]: input.checked });
        callbacks.onSettingsChange?.(getState().settings);
      });
    });
    document.getElementById("quality-select")?.addEventListener("change", (e) => {
      updateSettings({ quality: e.target.value });
      callbacks.onSettingsChange?.(getState().settings);
    });
    document.getElementById("save-name-btn")?.addEventListener("click", () => {
      const input = document.getElementById("display-name-input");
      const result = setDisplayName(input?.value);
      showToast(result.message);
    });
    panelContent?.querySelectorAll("[data-guide-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        audio.playUIClick();
        setTutorialGuideSection(btn.dataset.guideSection);
        renderPanel(getState());
      });
    });
    panelContent?.querySelector("[data-tutorial-resume]")?.addEventListener("click", () => {
      audio.playUIClick();
      menu?.classList.remove("open");
      refreshTutorialOverlay();
    });
    panelContent?.querySelector("[data-tutorial-restart]")?.addEventListener("click", () => {
      audio.playUIClick();
      restartTutorial();
      renderPanel(getState());
      refreshTutorialOverlay();
      showToast("Walkthrough restarted — follow the on-screen steps.");
    });
    panelContent?.querySelector("[data-tutorial-skip]")?.addEventListener("click", () => {
      audio.playUIClick();
      skipTutorial();
      renderPanel(getState());
      refreshTutorialOverlay();
      showToast("Walkthrough skipped.");
    });
    bindFishCardEvents(panelContent);
  }

  document.querySelectorAll("[data-panel]").forEach((tab) => {
    tab.addEventListener("click", () => {
      audio.playUIClick();
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
    audio.playUIClick();
    menu?.classList.toggle("open");
    if (menu?.classList.contains("open")) renderPanel(getState());
  });

  subscribe((state) => {
    renderHUD(state);
    if (menu?.classList.contains("open")) renderPanel(state);
    refreshTutorialOverlay();
  });

  renderHUD(getState());
  renderPanel(getState());
  setTimeout(() => refreshTutorialOverlay(), 800);

  return {
    showToast,
    updateSyncStatus,
    refreshTutorialOverlay,
    onTutorialTrigger,
    showContextualTip,
    showSpeciesCatchTip,
    checkTensionTip,
    setStatus(text) {
      if (statusText) statusText.textContent = text;
    },
    setTension(tension, progress, visible, meta = {}) {
      if (tensionBar) tensionBar.classList.toggle("visible", visible);
      if (tensionFill) {
        tensionFill.style.width = `${tension * 100}%`;
        const zone = meta.zone || tensionZone(tension, getRodStats(getState().rodLevel));
        tensionFill.dataset.zone = zone;
        if (tensionZoneLabel) {
          const labels = {
            sweet: "· sweet spot",
            high: "· ease off",
            warning: "· danger!",
            snap: "· too high!",
            loose: "· reel in",
          };
          tensionZoneLabel.textContent = visible ? labels[zone] || "" : "";
        }
      }
      if (reelProgress) reelProgress.style.width = `${progress * 100}%`;
      if (fightPhaseHint) {
        fightPhaseHint.textContent = meta.phaseLabel || "";
        fightPhaseHint.classList.toggle("visible", Boolean(meta.phaseLabel && visible));
      }
    },
    setBiteAlert(visible, speciesName, timerProgress = 1) {
      biteAlert?.classList.toggle("visible", visible);
      reelAlert?.classList.toggle("visible", false);
      if (speciesName && biteSpecies) biteSpecies.textContent = speciesName;
      if (biteTimerFill) biteTimerFill.style.width = `${timerProgress * 100}%`;
      if (biteAlertAction) biteAlertAction.textContent = biteActionText();
    },
    setReelAlert(visible) {
      reelAlert?.classList.toggle("visible", visible);
      biteAlert?.classList.toggle("visible", false);
      if (reelHint) reelHint.textContent = reelHintText();
    },
    showCatch(catchData, onCastAgain, onDismiss) {
      if (!catchOverlay) return;
      const newBadge = catchData.isNewSpecies
        ? '<p class="catch-new">New codex entry!</p>'
        : "";
      const legendary = catchData.rarity === "legendary" ? " legendary" : "";
      const fishColor = catchData.color || "#4a90c4";
      catchOverlay.innerHTML = `
        <div class="catch-card rarity-${catchData.rarity}${legendary}">
          <div class="catch-fish-visual" style="--fish-color: ${fishColor}" aria-hidden="true">
            <span class="catch-fish-body"></span>
            <span class="catch-fish-tail"></span>
            <span class="catch-fish-fin"></span>
          </div>
          <p class="catch-label">${catchData.rarity === "legendary" ? "LEGENDARY CATCH!" : "Caught!"}</p>
          <h2>${catchData.name}</h2>
          <p>${catchData.weight} lb · ${catchData.rarity}${catchData.baitUsed ? ` · ${catchData.baitUsed}` : ""}</p>
          <p class="catch-value">+${catchData.value} coins</p>
          ${newBadge}
          <p class="catch-dismiss">Tap a button below or wait to continue</p>
          <div class="catch-actions">
            <button id="catch-cast-again" type="button">Cast Again</button>
            <button id="catch-view-codex" type="button">View Codex</button>
          </div>
        </div>
      `;
      catchOverlay.classList.add("show");
      const dismiss = () => {
        catchOverlay.classList.remove("show");
        onDismiss?.();
      };
      document.getElementById("catch-cast-again")?.addEventListener("click", () => {
        dismiss();
        onCastAgain?.();
        callbacks.onCastAgain?.();
      });
      document.getElementById("catch-view-codex")?.addEventListener("click", () => {
        dismiss();
        activePanel = "codex";
        document.querySelectorAll("[data-panel]").forEach((t) =>
          t.classList.toggle("active", t.dataset.panel === "codex")
        );
        menu?.classList.add("open");
        renderPanel(getState());
      });
      setTimeout(() => {
        if (catchOverlay.classList.contains("show")) dismiss();
      }, 6000);
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
