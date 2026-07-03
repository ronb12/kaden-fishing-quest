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
  BOAT_USE_LEVEL,
  canUseBoat,
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
  getQuestProgress,
  claimDailyBonus,
  claimChainBonus,
  claimCodexBonus,
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
  getDailyChallengeStatus,
  allDailiesComplete,
  getQuestChainStatus,
  getCodexMilestoneStatus,
  getRadioReport,
} from "./retention.js";
import {
  GUIDED_STEPS,
  GUIDE_SECTIONS,
  CONTEXTUAL_TIPS,
  getGuidedStepBody,
} from "./tutorial.js";
import { renderCodexHTML, bindFishCardEvents, getSpeciesCatchTip, renderFishFieldGuideHTML } from "./fish-guide.js";

let activePanel = "guide";
let leaderboardSort = "fish";

export function initUI(fishing, callbacks) {
  const hud = document.getElementById("hud");
  const menu = document.getElementById("vr-menu");
  const menuBackdrop = document.getElementById("menu-backdrop");
  const menuCloseBtn = document.getElementById("menu-close");
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
  const tutorialCloseBtn = document.getElementById("tutorial-close");
  const tipBanner = document.getElementById("tip-banner");
  const tipBannerTitle = document.getElementById("tip-banner-title");
  const tipBannerText = document.getElementById("tip-banner-text");
  const tipBannerClose = document.getElementById("tip-banner-close");
  let tipBannerTimer = null;
  let toastTimer = null;
  let catchDismissFn = null;
  let catchAutoDismissTimer = null;
  let tutorialOverlayMinimized = false;
  let lastTensionZoneTip = null;
  let statusToneTimer = null;
  let prevHudStats = { fish: 0, coins: 0 };
  let fishingFocusMode = false;

  const TIPS_BLOCKED_IN_FOCUS = new Set([
    "bite", "hooked", "caught", "first_cast", "nibble", "preBite",
  ]);

  function setMenuOpen(open) {
    menu?.classList.toggle("open", open);
    menuBackdrop?.classList.toggle("show", open);
    menuBackdrop?.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function isMenuOpen() {
    return menu?.classList.contains("open");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function openMenu() {
    setMenuOpen(true);
    renderPanel(getState());
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    toast?.classList.remove("show");
  }

  function hideTipBanner() {
    clearTimeout(tipBannerTimer);
    tipBannerTimer = null;
    tipBanner?.classList.remove("show");
  }

  function hideTutorialOverlay() {
    tutorialOverlayMinimized = true;
    tutorialOverlay?.classList.remove("show");
    tutorialOverlay?.setAttribute("aria-hidden", "true");
  }

  function dismissCatchOverlay() {
    if (!catchOverlay?.classList.contains("show")) return false;
    clearTimeout(catchAutoDismissTimer);
    catchAutoDismissTimer = null;
    const onDismiss = catchDismissFn;
    catchDismissFn = null;
    catchOverlay.classList.remove("show");
    catchOverlay.setAttribute("aria-hidden", "true");
    onDismiss?.();
    return true;
  }

  function dismissTopOverlay() {
    if (isMenuOpen()) {
      closeMenu();
      return true;
    }
    if (dismissCatchOverlay()) return true;
    if (tutorialOverlay?.classList.contains("show")) {
      hideTutorialOverlay();
      return true;
    }
    if (tipBanner?.classList.contains("show")) {
      hideTipBanner();
      return true;
    }
    if (toast?.classList.contains("show")) {
      hideToast();
      return true;
    }
    return false;
  }

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
    if (fishingFocusMode) return;
    hideToast();
    toast.textContent = msg;
    toast.classList.add("show");
    toastTimer = setTimeout(hideToast, 1800);
  }

  function updateSyncStatus() {
    if (!syncIndicator) return;
    const status = getSyncStatus();
    syncIndicator.textContent =
      status === "synced" ? "☁ Saved" : status === "saving" ? "☁ Saving…" : status === "offline" ? "☁ Offline" : "☁ Local";
    syncIndicator.className = `sync-indicator sync-${status}`;
  }

  function renderHUD(state) {
    const fishEl = document.getElementById("hud-fish");
    const coinsEl = document.getElementById("hud-coins");
    if (state.fish > prevHudStats.fish) {
      fishEl?.classList.remove("stat-bump");
      void fishEl?.offsetWidth;
      fishEl?.classList.add("stat-bump");
    }
    if (state.coins > prevHudStats.coins) {
      coinsEl?.classList.remove("stat-bump");
      void coinsEl?.offsetWidth;
      coinsEl?.classList.add("stat-bump");
    }
    prevHudStats = { fish: state.fish, coins: state.coins };
    fishEl.textContent = state.fish;
    coinsEl.textContent = state.coins;
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

  function setFishingFocusMode(active) {
    fishingFocusMode = active;
    if (active) {
      hideTipBanner();
      hideToast();
    }
  }

  function showContextualTip(tipKey) {
    const tip = CONTEXTUAL_TIPS[tipKey];
    if (!tip || !shouldShowTip(tip.id)) return;
    if (fishingFocusMode && TIPS_BLOCKED_IN_FOCUS.has(tipKey)) return;
    if (biteAlert?.classList.contains("visible") || reelAlert?.classList.contains("visible")) return;
    markTipSeen(tip.id);
    if (tipBannerTitle) tipBannerTitle.textContent = tip.title || "Tip";
    if (tipBannerText) tipBannerText.textContent = tip.text;
    tipBanner?.classList.add("show");
    clearTimeout(tipBannerTimer);
    tipBannerTimer = setTimeout(hideTipBanner, fishingFocusMode ? 4000 : 5500);
  }

  function showSpeciesCatchTip(speciesId) {
    const tip = getSpeciesCatchTip(speciesId);
    if (!tip || !shouldShowTip(tip.id)) return;
    markTipSeen(tip.id);
    if (tipBannerTitle) tipBannerTitle.textContent = tip.title;
    if (tipBannerText) tipBannerText.textContent = tip.text;
    tipBanner?.classList.add("show");
    clearTimeout(tipBannerTimer);
    tipBannerTimer = setTimeout(hideTipBanner, 6000);
  }

  function refreshTutorialOverlay() {
    const tut = getTutorial();
    if (!tutorialOverlay) return;
    if (!tut.active || tut.completed || tutorialOverlayMinimized) {
      tutorialOverlay.classList.remove("show", "compact");
      tutorialOverlay.setAttribute("aria-hidden", "true");
      if (!tut.active || tut.completed) tutorialOverlayMinimized = false;
      return;
    }
    if (fishingFocusMode) {
      tutorialOverlay.classList.add("compact");
    } else {
      tutorialOverlay.classList.remove("compact");
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
    tutorialOverlayMinimized = false;
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
      tutorialOverlayMinimized = false;
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

  tipBannerClose?.addEventListener("click", () => {
    audio.playUIClick();
    hideTipBanner();
  });
  toast?.addEventListener("click", () => {
    if (toast.classList.contains("show")) hideToast();
  });
  menuCloseBtn?.addEventListener("click", () => {
    audio.playUIClick();
    closeMenu();
  });
  menuBackdrop?.addEventListener("click", () => {
    audio.playUIClick();
    closeMenu();
  });
  tutorialCloseBtn?.addEventListener("click", () => {
    audio.playUIClick();
    hideTutorialOverlay();
  });
  catchOverlay?.addEventListener("click", (e) => {
    if (e.target === catchOverlay) dismissCatchOverlay();
  });
  tutorialNextBtn?.addEventListener("click", () => {
    audio.playUIClick();
    tutorialNext();
  });
  tutorialSkipBtn?.addEventListener("click", () => {
    audio.playUIClick();
    tutorialOverlayMinimized = false;
    skipTutorial();
    refreshTutorialOverlay();
    showToast("Tutorial skipped — open Guide anytime from the menu.");
  });

  function renderZones(state) {
    return Object.values(ZONES)
      .map((z) => {
        const locked = !canAccessZone(z.id);
        const lockHint = locked
          ? z.boatRequired >= 2 && !canUseBoat(state.boatLevel)
            ? `Requires Boat Lvl ${BOAT_USE_LEVEL} skiff`
            : `Requires Boat Lvl ${z.boatRequired}`
          : z.description;
        const sail = z.id !== "Lake Dock" && canUseBoat(state.boatLevel) && state.zone === "Lake Dock";
        return `
          <button class="panel-btn ${state.zone === z.id ? "active" : ""} ${locked ? "locked" : ""}"
            data-zone="${z.id}" ${sail ? 'data-boat="1"' : ""} ${locked ? "disabled" : ""}>
            <strong>${z.label}</strong>
            <span>${lockHint}${sail ? " · sail by boat" : ""}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderCodex(state) {
    const base = renderCodexHTML(state);
    const trophies = (state.trophies || [])
      .map((t) => `<div class="trophy-row"><strong>${t.name}</strong><span>${t.weight} lb · ${t.rarity}</span></div>`)
      .join("") || "<p class='help-tip'>Catch fish to fill your trophy wall.</p>";
    const milestones = getCodexMilestoneStatus(state)
      .map((m) => {
        const done = m.done && !m.claimed;
        return `<div class="daily-row ${m.claimed ? "done" : ""}"><div><strong>${m.label}</strong><span>${Math.min(m.current, m.target)}/${m.target} · ${m.reward}c</span></div>${done ? `<button data-claim-codex="${m.id}">Claim</button>` : m.claimed ? "<span class='claimed'>Claimed</span>" : ""}</div>`;
      })
      .join("");
    return `${base}<div class="trophy-wall"><h3>Trophy Wall</h3>${trophies}</div><div class="daily-section"><h3>Codex Milestones</h3>${milestones}</div>`;
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
    const quests = QUESTS.map((q) => {
      const { current, target } = getQuestProgress(q);
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
    const dailies = getDailyChallengeStatus(state)
      .map((c) => {
        const allDone = allDailiesComplete(state);
        return `<div class="daily-row ${c.done ? "done" : ""}"><div><strong>${c.label}</strong><span>${Math.min(c.current, c.target)}/${c.target}</span></div></div>`;
      })
      .join("");
    const dailyClaim =
      allDailiesComplete(state) && !state.daily?.claimed
        ? `<button data-claim-daily>Claim daily bonus (+ streak)</button>`
        : state.daily?.claimed
          ? `<span class="claimed">Daily claimed · ${state.daily.streak || 0} day streak</span>`
          : `<span class="help-tip">Streak: ${state.daily?.streak || 0} days</span>`;
    const chains = getQuestChainStatus(state)
      .map((chain) => {
        const stepLabel = chain.done
          ? "Complete!"
          : chain.step
            ? `${chain.step.label} (${Math.min(chain.current, chain.target)}/${chain.target})`
            : "Starting…";
        const canClaim = chain.done && !state.claimedChainRewards?.includes(chain.id);
        return `<div class="chain-row ${chain.done ? "done" : ""}"><div><strong>${chain.title}</strong><span>${stepLabel} · ${chain.reward}c</span></div>${canClaim ? `<button data-claim-chain="${chain.id}">Claim</button>` : state.claimedChainRewards?.includes(chain.id) ? "<span class='claimed'>Claimed</span>" : ""}</div>`;
      })
      .join("");
    return `<h3>Story Quests</h3>${quests}<div class="daily-section"><h3>Daily Challenges</h3>${dailies}${dailyClaim}</div><div class="chain-section"><h3>Quest Chains</h3>${chains}</div>`;
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
        <label class="settings-toggle">
          <input type="checkbox" data-setting="spatialAudio" ${s.spatialAudio !== false ? "checked" : ""} />
          3D spatial splash &amp; bite sounds
        </label>
        <label class="settings-toggle">
          <input type="checkbox" data-setting="reelAssist" ${s.reelAssist ? "checked" : ""} />
          Reel assist (wider sweet zone)
        </label>
      </div>
      <div class="settings-section">
        <h3>VR comfort</h3>
        <label class="settings-toggle">
          <input type="checkbox" data-setting="vrSnapTurn" ${s.vrSnapTurn !== false ? "checked" : ""} />
          Snap turn (left stick)
        </label>
        <label class="settings-toggle">
          <input type="checkbox" data-setting="handTracking" ${s.handTracking ? "checked" : ""} />
          Hand tracking (experimental)
        </label>
      </div>
      <div class="settings-section">
        <label>Graphics quality</label>
        <select id="quality-select">
          <option value="high" ${s.quality === "high" ? "selected" : ""}>High</option>
          <option value="low" ${s.quality === "low" ? "selected" : ""}>Low (mobile)</option>
          <option value="quest" ${s.quality === "quest" ? "selected" : ""}>Quest / VR performance</option>
        </select>
      </div>
      <div class="settings-section radio-panel">
        <strong>📻 Lake radio</strong>
        <p>${getRadioReport(state)}</p>
      </div>
      <p class="help-tip">Player ID: ${getPlayerId().slice(0, 8)}… · Streak ${state.daily?.streak || 0} days</p>
    `;
  }

  async function renderLeaderboard() {
    panelContent.innerHTML = `
      <div class="leaderboard-tabs">
        <button class="lb-tab ${leaderboardSort === "fish" ? "active" : ""}" data-lb-sort="fish">Fish</button>
        <button class="lb-tab ${leaderboardSort === "coins" ? "active" : ""}" data-lb-sort="coins">Coins</button>
        <button class="lb-tab ${leaderboardSort === "weight" ? "active" : ""}" data-lb-sort="weight">Best Catch</button>
        <button class="lb-tab ${leaderboardSort === "codex" ? "active" : ""}" data-lb-sort="codex">Codex</button>
        <button class="lb-tab ${leaderboardSort === "weekly" ? "active" : ""}" data-lb-sort="weekly">This week</button>
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
    const sortLabel = { fish: "fish", coins: "coins", weight: "lb best", codex: "species", weekly: "fish (7d)" };
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
          const byBoat = btn.dataset.boat === "1";
          if (!byBoat) setZone(zone);
          callbacks.onZoneChange?.(zone, { byBoat });
          showToast(byBoat ? `Sailing to ${zone}…` : `Moved to ${zone}`);
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
          if (btn.dataset.upgrade === "boat") callbacks.onBoatUpgrade?.(getState().boatLevel);
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
    panelContent?.querySelectorAll("[data-claim-daily]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reward = claimDailyBonus();
        if (reward) {
          audio.playQuestComplete();
          showToast(`Daily complete! +${reward} coins`);
          renderPanel(getState());
        }
      });
    });
    panelContent?.querySelectorAll("[data-claim-chain]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reward = claimChainBonus(btn.dataset.claimChain);
        if (reward) {
          audio.playQuestComplete();
          showToast(`Quest chain complete! +${reward} coins`);
          renderPanel(getState());
        }
      });
    });
    panelContent?.querySelectorAll("[data-claim-codex]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reward = claimCodexBonus(btn.dataset.claimCodex);
        if (reward) {
          audio.playQuestComplete();
          showToast(`Codex milestone! +${reward} coins`);
          renderPanel(getState());
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
      tutorialOverlayMinimized = false;
      closeMenu();
      refreshTutorialOverlay();
    });
    panelContent?.querySelector("[data-tutorial-restart]")?.addEventListener("click", () => {
      audio.playUIClick();
      tutorialOverlayMinimized = false;
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
    if (isMenuOpen()) closeMenu();
    else openMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Escape") return;
    if (dismissTopOverlay()) {
      e.preventDefault();
      e.stopPropagation();
    }
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
    setFishingFocusMode,
    updateSyncStatus,
    refreshTutorialOverlay,
    onTutorialTrigger,
    showContextualTip,
    showSpeciesCatchTip,
    checkTensionTip,
    setStatus(text, tone = "") {
      if (!statusText) return;
      clearTimeout(statusToneTimer);
      statusText.textContent = text;
      statusText.classList.remove("urgent", "strike", "fail");
      if (tone) {
        statusText.classList.add(tone);
        if (tone === "fail") {
          statusToneTimer = setTimeout(() => statusText.classList.remove("fail"), 1800);
        }
      }
    },
    setCastCharge(visible, amount = 0) {
      const bar = document.getElementById("cast-charge-bar");
      const fill = document.getElementById("cast-charge-fill");
      bar?.classList.toggle("visible", visible);
      bar?.setAttribute("aria-hidden", visible ? "false" : "true");
      if (fill) fill.style.width = `${Math.round(amount * 100)}%`;
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
    setBiteAlert(visible, speciesName, timerProgress = 1, meta = {}) {
      biteAlert?.classList.toggle("visible", visible);
      biteAlert?.classList.toggle("legendary", Boolean(meta.legendary && visible));
      reelAlert?.classList.toggle("visible", false);
      if (visible) hideTipBanner();
      if (speciesName && biteSpecies) {
        biteSpecies.textContent = meta.legendary ? `⚡ ${speciesName}` : speciesName;
      }
      if (biteTimerFill) biteTimerFill.style.width = `${timerProgress * 100}%`;
      if (biteAlertAction) {
        biteAlertAction.textContent = meta.legendary ? "LEGENDARY — hook now!" : biteActionText();
      }
    },
    setReelAlert(visible) {
      reelAlert?.classList.toggle("visible", visible);
      biteAlert?.classList.toggle("visible", false);
      if (visible) hideTipBanner();
      if (reelHint) reelHint.textContent = reelHintText();
    },
    showCatch(catchData, onCastAgain, onDismiss) {
      if (!catchOverlay) return;
      hideTipBanner();
      clearTimeout(catchAutoDismissTimer);
      const newBadge = catchData.isNewSpecies
        ? '<p class="catch-new">New codex entry!</p>'
        : "";
      const legendary = catchData.rarity === "legendary" ? " legendary" : "";
      const fishColor = catchData.color || "#4a90c4";
      catchOverlay.innerHTML = `
        <div class="catch-card rarity-${catchData.rarity}${legendary}">
          <button type="button" class="overlay-close catch-close" aria-label="Close catch screen">×</button>
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
          <p class="catch-dismiss">Tap a button, press Esc, or wait to continue</p>
          <div class="catch-actions">
            <button id="catch-cast-again" type="button">Cast Again</button>
            <button id="catch-view-codex" type="button">View Codex</button>
            <button id="catch-share" type="button" class="share-catch-btn">Share</button>
          </div>
        </div>
      `;
      catchOverlay.classList.add("show");
      catchOverlay.setAttribute("aria-hidden", "false");
      const dismiss = () => {
        if (!catchOverlay.classList.contains("show")) return;
        clearTimeout(catchAutoDismissTimer);
        catchAutoDismissTimer = null;
        catchDismissFn = null;
        catchOverlay.classList.remove("show");
        catchOverlay.setAttribute("aria-hidden", "true");
        onDismiss?.();
      };
      catchDismissFn = onDismiss;
      catchOverlay.querySelector(".catch-close")?.addEventListener("click", () => {
        audio.playUIClick();
        dismiss();
      });
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
        openMenu();
      });
      document.getElementById("catch-share")?.addEventListener("click", async () => {
        const text = `I caught a ${catchData.weight} lb ${catchData.name} in Kaden VR Fishing Quest!`;
        try {
          if (navigator.share) {
            await navigator.share({ title: "Kaden VR Fishing Quest", text });
          } else {
            await navigator.clipboard.writeText(text);
            showToast("Catch copied to clipboard!");
          }
        } catch {
          showToast("Share cancelled");
        }
      });
      catchAutoDismissTimer = setTimeout(() => {
        if (catchOverlay.classList.contains("show")) dismiss();
      }, 6000);
    },
    toggleMenu() {
      if (isMenuOpen()) closeMenu();
      else openMenu();
    },
    closeMenu,
    dismissTopOverlay,
    openPanel(name) {
      activePanel = name;
      document.querySelectorAll("[data-panel]").forEach((t) =>
        t.classList.toggle("active", t.dataset.panel === activePanel)
      );
      openMenu();
    },
  };
}
