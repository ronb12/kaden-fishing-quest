import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { LakeEnvironment } from "./environment.js";
import { FishingSystem, FishingState } from "./fishing.js";
import { initUI } from "./ui.js";
import {
  getState,
  setZone,
  canAccessZone,
  initState,
  setBait,
  getSelectedBait,
  updateSettings,
  subscribe,
  setDisplayName,
} from "./state.js";
import { BAITS, ZONES, BOAT_USE_LEVEL, canUseBoat, canBoatTravelToZone } from "./data.js";
import * as audio from "./audio.js";
import { initTouchControls } from "./touch-controls.js";
import { loadGameAssets, updateModelAnimations } from "./asset-loader.js";
import { loadEnvironmentMaps, reloadEnvironmentMaps } from "./environment-loader.js";
import { VRFishingMotion } from "./vr-fishing.js";
import { VRHandRig } from "./vr-hands.js";
import { moveWithCollisions, correctRigFromEye } from "./collisions.js";
import { BUILD_ID } from "./version.js";
import { DOCK_SPAWN } from "./dock-layout.js";
import { tensionZone } from "./fish-fight.js";
import { getRodStats } from "./gear-stats.js";
import { VRComfort } from "./vr-comfort.js";
import { VRHud } from "./vr-ui.js";
import { startBoatVoyage, getBoatTravelDuration } from "./boat-travel.js";
import { HandTrackingInput } from "./hand-tracking.js";
import { getBoatSpeedMultiplier } from "./data.js";
import { getRadioReport } from "./retention.js";

let ui = null;
let touch = { active: false };

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const player = new THREE.Group();
player.name = "Player";
scene.add(player);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 280);
player.add(camera);
player.position.set(DOCK_SPAWN.x, 0, DOCK_SPAWN.z);
camera.position.set(0, 1.6, 0);

const _worldEye = new THREE.Vector3();
function getWorldEye(out = _worldEye) {
  camera.getWorldPosition(out);
  return out;
}

let env = null;
let fishing = null;
let envMaps = null;

const loadingEl = document.getElementById("asset-loading");
const loadingFill = document.getElementById("asset-loading-fill");
const loadingLabel = document.getElementById("asset-loading-label");
const loadingVersion = document.getElementById("asset-loading-version");
const hudVersion = document.getElementById("hud-version");
if (loadingVersion) loadingVersion.textContent = `Build ${BUILD_ID}`;
if (hudVersion) hudVersion.textContent = BUILD_ID;

await loadGameAssets((progress, name) => {
  if (loadingFill) loadingFill.style.width = `${Math.round(progress * 100)}%`;
  if (loadingLabel) loadingLabel.textContent = name ? `Loading ${name.replace(/_/g, " ")}…` : "Loading assets…";
});
await audio.loadAudioAssets();
if (loadingLabel) loadingLabel.textContent = "Loading sky and lighting…";
envMaps = await loadEnvironmentMaps(renderer, getState().settings?.quality || "high");
if (loadingLabel) loadingLabel.textContent = "Ready — tight lines!";
await new Promise((resolve) => setTimeout(resolve, 450));
loadingEl?.classList.add("hidden");
setTimeout(() => document.getElementById("hud")?.classList.remove("hud-intro"), 900);

env = new LakeEnvironment(scene, envMaps);
env.applyZone(getState().zone);

fishing = new FishingSystem(scene, env, onFishingEvent);

const controllerModelFactory = new XRControllerModelFactory();
const controllers = [];
const grips = [];
const controllerModels = [];

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  controller.addEventListener("selectstart", () => onSelect(i));
  controller.addEventListener("selectend", () => onSelectEnd(i));
  if (i === 0) controller.addEventListener("squeezestart", () => ui?.toggleMenu());
  scene.add(controller);
  controllers.push(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grips.push(grip);
  const model = controllerModelFactory.createControllerModel(grip);
  controllerModels.push(model);
  grip.add(model);
  scene.add(grip);
}

const vrHands = new VRHandRig(grips, controllerModels);

fishing.attachToController(controllers[1]);
const vrMotion = new VRFishingMotion();
const vrComfort = new VRComfort(player, () => getState().settings);
const vrHud = new VRHud(
  document.getElementById("vr-hud"),
  document.getElementById("vr-tension"),
  document.getElementById("vr-tension-fill")
);
let handTracking = null;
let boatVoyageActive = false;
const travelOverlay = document.getElementById("travel-overlay");
const fightCoach = document.getElementById("fight-coach");
fishing.audioCamera = camera;

document.body.appendChild(VRButton.createButton(renderer));

let inVR = false;
renderer.xr.addEventListener("sessionstart", async () => {
  inVR = true;
  document.body.classList.add("vr-active");
  vrMotion.resetCast();
  vrComfort.reset();
  vrHands.setControllerModelsVisible(false);
  vrHud.setActive(true);
  vrHud.setHint("Swing rod back, then forward to cast · crank left hand to reel");
  teleportToZone(getState().zone);
  const session = renderer.xr.getSession();
  handTracking = new HandTrackingInput(session, () => getState().settings);
  await handTracking.tryEnable(session);
  ui?.showToast("VR: snap-turn with stick · trigger at skiff to sail · left grip = menu");
});
renderer.xr.addEventListener("sessionend", () => {
  inVR = false;
  document.body.classList.remove("vr-active");
  vrHands.setControllerModelsVisible(true);
  vrHud.setActive(false);
  handTracking?.disable();
  handTracking = null;
});

const keys = {};
let mouseX = 0;
let mouseY = 0;
let pointerLocked = false;
let reelHeld = false;
let castCharging = false;
let castCharge = 0;
let spaceWasDown = false;
let prevReelHeld = false;
let lastTensionZone = "sweet";
let gameStarted = false;
let lastHudStatus = "";
const uiFrameCache = { biteProgress: -1, reelTension: -1, reelProgress: -1 };

function dismissLoadingHint() {
  if (gameStarted) return;
  gameStarted = true;
  document.querySelector(".loading-hint")?.classList.add("hidden");
  audio.resumeAudio();
  audio.startAmbient();
}

function refreshStatus() {
  if (!ui) return;
  updateBoatInteractTarget();
  let text;
  let tone = "";
  if (boatInteractTarget && fishing.state === FishingState.IDLE) {
    text = inVR ? `[Trigger] ${boatInteractTarget.label}` : `[E] ${boatInteractTarget.label}`;
  } else if (cabinInteractTarget && fishing.state === FishingState.IDLE) {
    text = inVR ? `[Trigger] ${cabinInteractTarget.label}` : `[E] ${cabinInteractTarget.label}`;
  } else if (castCharging && fishing.state === FishingState.IDLE) {
    const pct = Math.round((0.35 + castCharge * 0.65) * 100);
    text = `Charging cast… ${pct}% — release Space`;
    ui.setCastCharge?.(true, castCharge);
    if (inVR) vrHud.setStatus(text, tone);
    else if (text !== lastHudStatus) { lastHudStatus = text; ui.setStatus(text, tone); }
    return;
  } else {
    ui.setCastCharge?.(false);
    if (fishing.state !== FishingState.IDLE) {
      text = fishing.getStatusText(inVR);
      tone = fishing.state === FishingState.BITING ? "strike" : fishing.state === FishingState.WAITING && fishing.preBiteWarned ? "urgent" : "";
    } else if (touch.active) {
      text = "Hold Cast to charge · drag right to look · joystick to move";
    } else if (pointerLocked) {
      text = "WASD move · hold Space to cast · hold R to reel · M menu · H guide";
    } else if (inVR) {
      text = fishing.getStatusText(true);
    } else {
      text = "Click to look · WASD to move · walk the boardwalk to the lake";
    }
  }
  if (inVR) {
    vrHud.setStatus(text, tone);
    return;
  }
  if (text !== lastHudStatus) {
    lastHudStatus = text;
    ui.setStatus(text, tone);
  }
}

function getAimDirection() {
  const aim = new THREE.Vector3(0, 0, -1);
  aim.applyQuaternion(camera.quaternion);
  aim.y = 0;
  if (aim.lengthSq() < 0.01) aim.set(0, 0, -1);
  return aim.normalize();
}

function getVrAimDirection() {
  const aim = new THREE.Vector3(0, 0, -1);
  aim.applyQuaternion(controllers[1].quaternion);
  aim.y = 0;
  if (aim.lengthSq() < 0.01) return getAimDirection();
  return aim.normalize();
}

let cabinInteractTarget = null;
let boatInteractTarget = null;

function updateBoatInteractTarget() {
  boatInteractTarget = null;
  if (getState().zone !== "Lake Dock" || fishing.state !== FishingState.IDLE) return;
  if (!env?.isNearMooringBoat(player.position.x, player.position.z)) return;
  if (canUseBoat(getState().boatLevel)) {
    boatInteractTarget = { label: "Board skiff — sail to fishing zones" };
  } else {
    boatInteractTarget = { label: `Skiff locked — upgrade to Boat Lvl ${BOAT_USE_LEVEL}` };
  }
}

function tryBoatInteract() {
  updateBoatInteractTarget();
  if (!boatInteractTarget) return false;
  audio.playUIClick();
  if (!canUseBoat(getState().boatLevel)) {
    ui?.showToast(`Upgrade boat to level ${BOAT_USE_LEVEL} to unlock the skiff`);
    return true;
  }
  ui?.openPanel("zones");
  ui?.showToast("Pick a zone to cast off");
  return true;
}

function handleCabinInteraction(id) {
  const cg = env?.campground;
  if (!cg) return;
  const state = getState();
  audio.resumeAudio();

  switch (id) {
    case "tackle-box":
      ui?.openPanel("bait");
      ui?.showToast("Tackle box — pick your bait");
      break;
    case "gear-locker":
      ui?.openPanel("gear");
      ui?.showToast("Gear locker — upgrade rod & boat");
      break;
    case "dresser":
      ui?.openPanel("codex");
      ui?.showToast("Fish journal — your catches");
      break;
    case "zone-map":
      ui?.openPanel("zones");
      ui?.showToast("Lake map — choose a fishing spot");
      break;
    case "lantern":
      ui?.showToast(cg.toggleLantern());
      break;
    case "fireplace": {
      const msg = cg.toggleFireplace();
      audio.setFireplaceActive(cg.fireplaceOn, camera.position, camera);
      ui?.showToast(msg);
      break;
    }
    case "trophy": {
      ui?.openPanel("codex");
      const count = Object.keys(state.codex).length;
      ui?.showToast(
        count > 0 ? `Trophy wall — ${count} species logged` : "Empty trophy wall — go catch some fish!"
      );
      break;
    }
    case "coffee":
      ui?.showToast("Warm coffee — perfect before dawn fishing");
      break;
    case "kettle":
      ui?.showToast("Kettle's hot — tea ready for the camp");
      break;
    case "stove":
      ui?.showToast("Camp stove packed — cook after a long day");
      break;
    case "rod-rack":
      ui?.showToast(`Rod rack — your level ${state.rodLevel} rod is equipped`);
      break;
    case "coat-rack":
      ui?.showToast("Waterproof jacket — hangs dry by the door");
      break;
    case "boots":
      ui?.showToast("Muddy fishing boots — ready for the dock");
      break;
    case "radio":
      ui?.showToast(getRadioReport(state).replace(/\n/g, " · "));
      break;
    case "quest-board":
      ui?.openPanel("quests");
      ui?.showToast("Quest board — dailies, chains, and story quests");
      break;
    default:
      break;
  }
}

function tryCabinInteract() {
  const target = env?.campground?.pickInteractable(camera);
  if (target) {
    handleCabinInteraction(target.id);
    return true;
  }
  return false;
}

function performCast(power, aimDir = null) {
  const aim = aimDir || (inVR ? getVrAimDirection() : getAimDirection());
  fishing.startCast(power, aim);
}

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  audio.resumeAudio();
  if (e.code === "Space") e.preventDefault();
  if (e.code === "Digit1") switchZone("Lake Dock");
  if (e.code === "Digit2") switchZone("North Cove");
  if (e.code === "Digit3") switchZone("Deep Water");
  if (e.code === "Digit4") switchZone("Moonlit Cove");
  if (e.code === "KeyM") ui?.toggleMenu();
  if (e.code === "KeyH") ui?.openPanel?.("guide");
  if (e.code === "KeyB") ui?.openPanel?.("bait");
  if (e.code === "KeyE") {
    if (tryCabinInteract()) return;
    tryBoatInteract();
  }
  const baitKeyMap = {
    Digit4: 0, Digit5: 1, Digit6: 2, Digit7: 3, Digit8: 4, Digit9: 5, Digit0: 6,
    Minus: 7, Equal: 8, Backquote: 9,
  };
  if (baitKeyMap[e.code] !== undefined) {
    const bait = BAITS[baitKeyMap[e.code]];
    if (bait) {
      const result = setBait(bait.id);
      if (result.ok) {
        fishing.onBaitChanged();
        ui?.showToast(result.message);
      }
    }
  }
});
document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "Space" && castCharging && fishing.state === FishingState.IDLE) {
    performCast(0.35 + castCharge * 0.65);
    castCharging = false;
    castCharge = 0;
    updateTouchUI();
  }
});

canvas.addEventListener("click", () => {
  dismissLoadingHint();
  audio.resumeAudio();
  if (!inVR && !touch.active) {
    if (env?.campground?.insideCabin && tryCabinInteract()) return;
    if (tryBoatInteract()) return;
    if (!pointerLocked) canvas.requestPointerLock();
  }
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) dismissLoadingHint();
});
document.addEventListener("mousemove", (e) => {
  if (pointerLocked) {
    mouseX -= e.movementX * 0.002;
    mouseY -= e.movementY * 0.002;
    mouseY = Math.max(-1.2, Math.min(1.2, mouseY));
  }
});

function onSelect(i) {
  if (i === 0 && inVR) {
    updateBoatInteractTarget();
    if (boatInteractTarget) {
      tryBoatInteract();
      return;
    }
    tryVrZoneTeleport(controllers[0]);
    return;
  }
  if (i !== 1) return;
  if (inVR && env?.campground?.insideCabin) {
    const target = env.campground.pickInteractable(camera);
    if (target) {
      handleCabinInteraction(target.id);
      return;
    }
  }
  handleFishingAction();
}
function onSelectEnd(i) {
  if (i === 1) reelHeld = false;
}

function tryVrZoneTeleport(controller) {
  const pos = new THREE.Vector3();
  controller.getWorldPosition(pos);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion);
  let closest = null;
  let closestDist = Infinity;
  env.zoneMarkers.forEach((marker) => {
    const mpos = marker.position;
    const dx = mpos.x - pos.x;
    const dz = mpos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const toMarker = new THREE.Vector3(dx, 0, dz).normalize();
    const dot = dir.x * toMarker.x + dir.z * toMarker.z;
    if (dist < 6 && dot > 0.85 && dist < closestDist) {
      closestDist = dist;
      closest = marker;
    }
  });
  if (closest) {
    const zoneId = closest.userData.zoneId;
    if (canAccessZone(zoneId)) {
      switchZone(zoneId);
      audio.playUIClick();
    } else {
      ui?.showToast(`Upgrade boat to access ${zoneId}`);
    }
  }
}

function handleFishingAction() {
  const fs = fishing.state;
  if (fs === FishingState.IDLE) {
    if (inVR) {
      ui?.showToast("Pull rod back, then swing forward to cast");
      return;
    }
    if (touch.active) {
      castCharging = true;
      castCharge = 0;
      updateTouchUI();
    } else {
      castCharging = true;
      castCharge = 0;
    }
  } else if (fs === FishingState.BITING) {
    fishing.hookFish();
    vrMotion.pulseHaptic(controllers[1], 0.75, 60);
  } else if (fs === FishingState.REELING && !inVR) {
    reelHeld = true;
  }
  updateTouchUI();
}

function vibrate(ms = 40) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function updateTouchUI() {
  if (!touch.active) return;
  const fs = fishing.state;
  switch (fs) {
    case FishingState.IDLE:
      touch.setActionLabel(castCharging ? "Release…" : "Cast");
      touch.setActionEnabled(true);
      touch.setReelVisible(false);
      touch.setBiteMode(false);
      break;
    case FishingState.CASTING:
      touch.setActionLabel("Casting…");
      touch.setActionEnabled(false);
      touch.setReelVisible(false);
      touch.setBiteMode(false);
      break;
    case FishingState.WAITING:
      touch.setActionLabel("Waiting…");
      touch.setActionEnabled(false);
      touch.setReelVisible(false);
      touch.setBiteMode(false);
      break;
    case FishingState.BITING:
      touch.setActionLabel("HOOK!");
      touch.setActionEnabled(true);
      touch.setReelVisible(false);
      touch.setBiteMode(true);
      break;
    case FishingState.REELING:
      touch.setActionLabel("Hooked");
      touch.setActionEnabled(false);
      touch.setReelVisible(true);
      touch.setBiteMode(false);
      break;
    default:
      touch.setActionLabel("Cast");
      touch.setActionEnabled(true);
      touch.setReelVisible(false);
      touch.setBiteMode(false);
  }
}

function syncFishingUiFocus() {
  const focused = fishing && [
    FishingState.WAITING,
    FishingState.BITING,
    FishingState.REELING,
  ].includes(fishing.state);
  ui?.setFishingFocusMode?.(focused);
  if (focused) ui?.refreshTutorialOverlay?.();
  env?.setZoneMarkersVisible?.(!focused);
}

function onFishingEvent(type, data) {
  switch (type) {
    case "cast":
      ui?.onTutorialTrigger?.("cast");
      ui?.setStatus(fishing.getStatusText(inVR));
      syncFishingUiFocus();
      break;
    case "nibble":
      ui?.onTutorialTrigger?.("nibble");
      ui?.setStatus(fishing.getStatusText(inVR));
      vibrate(12);
      break;
    case "preBite":
      audio.playPreBite();
      ui?.setStatus(fishing.getStatusText(), "urgent");
      vibrate(30);
      break;
    case "bite":
      uiFrameCache.biteProgress = -1;
      ui?.onTutorialTrigger?.("bite");
      ui?.setBiteAlert(true, data.species?.name, 1, { legendary: data.legendary });
      ui?.setStatus(fishing.getStatusText(), "strike");
      if (data.legendary) vibrate([80, 40, 80]);
      else vibrate(60);
      break;
    case "biteTick": {
      const progress = data.progress ?? 1;
      if (Math.abs(progress - uiFrameCache.biteProgress) < 0.02) break;
      uiFrameCache.biteProgress = progress;
      ui?.setBiteAlert(true, data.species?.name, progress, { legendary: fishing.legendaryEvent });
      break;
    }
    case "hooked":
      uiFrameCache.reelTension = -1;
      uiFrameCache.reelProgress = -1;
      ui?.onTutorialTrigger?.("hooked");
      ui?.setBiteAlert(false);
      ui?.setReelAlert(true);
      if (!getState().settings?.fightCoachSeen) {
        fightCoach?.classList.add("visible");
        fightCoach?.setAttribute("aria-hidden", "false");
        updateSettings({ fightCoachSeen: true });
        setTimeout(() => {
          fightCoach?.classList.remove("visible");
          fightCoach?.setAttribute("aria-hidden", "true");
        }, 9000);
      }
      ui?.setStatus(fishing.getStatusText(inVR));
      ui?.setTension(fishing.tension, fishing.reelProgress, true, {
        phaseLabel: fishing.fightPhaseLabel,
      });
      vrHud.setTension(fishing.tension, fishing.reelProgress, true);
      break;
    case "reeling": {
      const t = data.tension ?? 0;
      const p = data.progress ?? 0;
      const changed =
        data.phaseChanged ||
        Math.abs(t - uiFrameCache.reelTension) >= 0.025 ||
        Math.abs(p - uiFrameCache.reelProgress) >= 0.02;
      if (!changed) break;
      uiFrameCache.reelTension = t;
      uiFrameCache.reelProgress = p;
      const tensionOpts = { reelAssist: getState().settings?.reelAssist };
      ui?.checkTensionTip?.(
        tensionZone(t, getRodStats(getState().rodLevel), tensionOpts),
        data.phase
      );
      ui?.setTension(t, p, true, {
        phase: data.phase,
        phaseLabel: data.phaseLabel,
      });
      vrHud.setTension(t, p, true);
      ui?.setStatus(fishing.getStatusText(inVR));
      if (data.phaseChanged && inVR) {
        const strong = data.phase === "run" || data.phase === "thrash" || data.phase === "surge";
        vrMotion.pulseHaptic(controllers[1], strong ? 0.55 : 0.25, strong ? 55 : 30);
      }
      break;
    }
    case "caught":
      ui?.onTutorialTrigger?.("caught");
      if (data.isNewSpecies && data.speciesId) {
        ui?.showSpeciesCatchTip?.(data.speciesId);
      }
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      syncFishingUiFocus();
      ui?.showCatch(
        data,
        () => {
          fishing.reset();
          performCast(0.75);
        },
        () => fishing.reset()
      );
      ui?.setTension(0, 0, false);
      ui?.setStatus(fishing.getStatusText());
      break;
    case "failed":
      syncFishingUiFocus();
      if (data.reason === "snap") ui?.showContextualTip?.("failed_snap");
      else if (data.reason === "escape") ui?.showContextualTip?.("failed_escape");
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      ui?.setTension(0, 0, false);
      ui?.setStatus(data.message, "fail");
      break;
    case "reset":
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      ui?.setTension(0, 0, false);
      ui?.setStatus(fishing.getStatusText(inVR));
      vrMotion.resetCast();
      syncFishingUiFocus();
      break;
    default:
      ui?.setStatus(fishing.getStatusText());
  }
  updateTouchUI();
}

function switchZone(zoneId, opts = {}) {
  if (!canAccessZone(zoneId)) {
    const zone = ZONES[zoneId];
    if (zone?.boatRequired >= 2 && !canUseBoat(getState().boatLevel)) {
      ui?.showToast(`Upgrade boat to level ${BOAT_USE_LEVEL} to unlock the skiff and reach ${zoneId}`);
    } else {
      ui?.showToast(`Upgrade boat to access ${zoneId}`);
    }
    return;
  }
  const useBoat =
    opts.byBoat &&
    getState().zone === "Lake Dock" &&
    zoneId !== "Lake Dock" &&
    canUseBoat(getState().boatLevel);
  const apply = () => {
    setZone(zoneId);
    teleportToZone(zoneId);
    env.applyZone(zoneId);
    ui?.showToast(`Now at ${zoneId}`);
  };
  if (useBoat && !boatVoyageActive) {
    boatVoyageActive = true;
    const dest = ZONES[zoneId].teleport;
    const duration = getBoatTravelDuration(getState().boatLevel) / getBoatSpeedMultiplier(getState().boatLevel);
    startBoatVoyage({
      from: getWorldEye(),
      to: { x: dest.x, y: dest.y + 1.6, z: dest.z },
      player,
      camera,
      overlayEl: travelOverlay,
      duration,
      onMidpoint: () => env.applyZone(zoneId),
      onComplete: () => {
        setZone(zoneId);
        player.position.set(dest.x, 0, dest.z);
        applyGroundEyeHeight();
        aimAtFishingPool(ZONES[zoneId]);
        boatVoyageActive = false;
        ui?.showToast(`Docked at ${zoneId}`);
      },
    });
    return;
  }
  apply();
}

function aimAtFishingPool(zone) {
  if (!zone) return;
  const eye = getWorldEye();
  const look = new THREE.Vector3(
    zone.lookAt?.x ?? zone.castCenter.x,
    zone.lookAt?.y ?? 0.4,
    zone.lookAt?.z ?? zone.castCenter.z
  );
  camera.lookAt(look);
  const dx = look.x - eye.x;
  const dz = look.z - eye.z;
  const dy = look.y - eye.y;
  mouseX = Math.atan2(dx, dz);
  mouseY = Math.atan2(dy, Math.hypot(dx, dz));
  mouseY = Math.max(-1.2, Math.min(1.2, mouseY));
  player.rotation.y = mouseX;
  camera.rotation.order = "YXZ";
  camera.rotation.y = 0;
  camera.rotation.x = mouseY;
}

function applyGroundEyeHeight() {
  if (inVR) return;
  let y = 1.6;
  const stairY = env?.getDockWalkEyeHeight?.(player.position.x, player.position.z);
  if (stairY != null) y = stairY;
  camera.position.y = y;
}

function teleportToZone(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) return;
  player.position.set(zone.teleport.x, 0, zone.teleport.z);
  applyGroundEyeHeight();
  aimAtFishingPool(zone);
}

const clock = new THREE.Clock();
const moveSpeed = 4;
const WORLD_BOUNDS = 45;

function resolvePlayerCollisions() {
  if (!env?.collisions) return;
  correctRigFromEye(player, camera, env.collisions, WORLD_BOUNDS);
}

ui = initUI(fishing, {
  onEnterVR: () => {},
  isVR: () => inVR,
  onZoneChange: (zone, opts) => {
    switchZone(zone, opts);
  },
  onRodUpgrade: () => {
    fishing.onRodLevelUp();
    audio.playUpgrade();
  },
  onBoatUpgrade: (level) => {
    env?.updateBoatForLevel(level);
    if (canUseBoat(level)) {
      ui?.showToast("Skiff moored at the dock — press E beside it to sail");
    }
  },
  onBaitChange: () => fishing.onBaitChanged(),
  onSettingsChange: async (settings) => {
    audio.applyAudioSettings(settings);
    env.setQuality(settings.quality || "high");
    const pr =
      settings.quality === "low" || settings.quality === "quest"
        ? 1
        : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    const reloaded = await reloadEnvironmentMaps(renderer, scene, envMaps, settings.quality || "high");
    if (reloaded) {
      envMaps = reloaded;
      env.setEnvironmentMaps(envMaps);
    }
  },
  onCastAgain: () => performCast(0.75),
});

await initState();
audio.applyAudioSettings(getState().settings);
env.setQuality(getState().settings?.quality || "high");
teleportToZone(getState().zone);
env.applyZone(getState().zone);
env.updateBoatForLevel(getState().boatLevel);

function maybeShowNamePrompt() {
  if (getState().displayName) return;
  // Non-blocking hint — full-screen name modal blocked gameplay (especially VR).
  ui?.showToast("Tip: set your angler name in Menu → Settings for the leaderboard.");
}
maybeShowNamePrompt();

subscribe((state) => {
  ui?.updateSyncStatus?.();
  env?.updateBoatForLevel(state.boatLevel);
});

touch = initTouchControls({
  onLook(dx, dy) {
    mouseX -= dx * 0.004;
    mouseY -= dy * 0.004;
    mouseY = Math.max(-1.2, Math.min(1.2, mouseY));
    audio.resumeAudio();
  },
  onAction() {
    audio.resumeAudio();
    handleFishingAction();
  },
  onActionEnd() {
    if (castCharging && fishing.state === FishingState.IDLE) {
      performCast(0.35 + castCharge * 0.65);
      castCharging = false;
      castCharge = 0;
      updateTouchUI();
    }
  },
  onReelStart() {
    reelHeld = true;
    audio.resumeAudio();
  },
  onReelEnd() {
    reelHeld = false;
  },
  onBait() {
    ui?.openPanel?.("bait");
  },
  onMenu() {
    ui?.toggleMenu();
  },
}) || { active: false };

if (touch.active) {
  document.getElementById("status-text").textContent = "Drag right to look · joystick to move · follow the path to the cabin";
  updateTouchUI();
}

function updateDesktopMovement(dt) {
  if (inVR) return;
  player.rotation.y = mouseX;
  camera.rotation.order = "YXZ";
  camera.rotation.y = 0;
  camera.rotation.x = mouseY;

  const dir = new THREE.Vector3();
  if (touch.active) {
    const mv = touch.getMoveVector();
    dir.x = mv.x;
    dir.z = mv.z;
    reelHeld = touch.isReelHeld();
    if (castCharging) {
      castCharge = Math.min(1, castCharge + dt * 0.9);
      touch.setActionLabel(`Cast ${Math.round((0.35 + castCharge * 0.65) * 100)}%`);
    }
  } else {
    if (keys.KeyW) dir.z -= 1;
    if (keys.KeyS) dir.z += 1;
    if (keys.KeyA) dir.x -= 1;
    if (keys.KeyD) dir.x += 1;
    if (keys.Space && !spaceWasDown && fishing.state === FishingState.IDLE) {
      castCharging = true;
      castCharge = 0;
      spaceWasDown = true;
    }
    if (keys.Space && castCharging) {
      castCharge = Math.min(1, castCharge + dt * 0.9);
    }
    if (!keys.Space) spaceWasDown = false;
    reelHeld = keys.KeyR;
  }

  if (dir.length() > 0) {
    dir.normalize();
    dir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouseX));
    const delta = dir.multiplyScalar(moveSpeed * dt);
    const feet = new THREE.Vector3(player.position.x, 0, player.position.z);
    if (env?.collisions) {
      const moved = moveWithCollisions(feet, delta, env.collisions);
      player.position.x = moved.x;
      player.position.z = moved.z;
    } else {
      player.position.x += delta.x;
      player.position.z += delta.z;
    }
    player.position.x = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, player.position.x));
    player.position.z = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, player.position.z));
    applyGroundEyeHeight();
    resolvePlayerCollisions();
    if (fishing.state === FishingState.WAITING) {
      fishing.addLureMotion(dt * 0.35);
    }
  } else if (fishing.state === FishingState.WAITING && (Math.abs(mouseX) > 0.01 || Math.abs(mouseY) > 0.01)) {
    fishing.addLureMotion(dt * 0.12);
  }

  // Slight right bias, mostly forward — first-person rod hold in front of chest
  const eye = getWorldEye();
  const rodOffset = new THREE.Vector3(0.14, -0.34, -0.64).applyQuaternion(camera.quaternion);
  fishing.updateRodTransform(
    {
      position: eye.clone().add(rodOffset),
      quaternion: camera.quaternion,
      pitch: mouseY,
    },
    null,
    "desktop"
  );
}

function updateVrFishing(dt) {
  if (!inVR) return;

  const motion = vrMotion.update(
    controllers[1],
    controllers[0],
    camera,
    fishing.rodGroup,
    dt,
    fishing.state
  );

  fishing.setVrWindup(motion.swingVisual);
  fishing.updateReelVisual(motion.reelRotation ?? 0);
  vrHands.update(fishing.state, motion, fishing.getReelKnobWorld());

  if (fishing.state === FishingState.IDLE && motion.windup > 0.12) {
    ui?.setStatus(`Wind up… ${Math.round(motion.windup * 100)}% — swing forward to cast!`);
  }

  if (motion.castRelease && fishing.state === FishingState.IDLE) {
    if (fishing.startCast(motion.castRelease.power, motion.castRelease.aimDir)) {
      ui?.setStatus(fishing.getStatusText(true));
    }
  }

  if (motion.hookSet && fishing.state === FishingState.BITING) {
    fishing.hookFish();
    ui?.setStatus(fishing.getStatusText(true));
  }

  if (fishing.state === FishingState.REELING && motion.reelIntensity > 0.02) {
    fishing.reel(dt, motion.reelIntensity);
    reelHeld = true;
  } else if (fishing.state === FishingState.REELING) {
    fishing.updateReelIdle(dt);
    reelHeld = false;
  }

  const handInput = handTracking?.poll();
  if (handInput?.reel > 0.02 && fishing.state === FishingState.REELING) {
    fishing.reel(dt, handInput.reel);
    reelHeld = true;
  }
  if (handInput?.cast && fishing.state === FishingState.IDLE && motion.windup > 0.5) {
    if (fishing.startCast(motion.windup, getVrAimDirection())) {
      ui?.setStatus(fishing.getStatusText(true));
    }
  }

  fishing.updateRodTransform(controllers[1], motion);

  if (fishing.state === FishingState.WAITING && motion.lureMotion > 0.02) {
    fishing.addLureMotion(motion.lureMotion * dt * 2.5);
  }
}

function checkZoneTeleports() {
  const pos = inVR ? new THREE.Vector3() : camera.position;
  if (inVR) return;
  env.zoneMarkers.forEach((marker) => {
    const dx = pos.x - marker.position.x;
    const dz = pos.z - marker.position.z;
    if (dx * dx + dz * dz < 2.25) {
      const zoneId = marker.userData.zoneId;
      if (zoneId !== getState().zone && canAccessZone(zoneId)) {
        setZone(zoneId);
        env.applyZone(zoneId);
        ui?.showToast(`Entered ${zoneId}`);
      }
    }
  });
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  env.update(time, dt, camera);
  audio.updateAudioListener(camera);
  if (inVR) {
    vrComfort.update(dt, controllers[0], controllers[1]);
    vrComfort.tick(dt);
  }
  if (env?.campground?.insideCabin && env.campground.fireplaceOn) {
    audio.setFireplaceActive(true, camera.position, camera);
  } else {
    audio.setFireplaceActive(false);
  }
  updateVrFishing(dt);
  updateDesktopMovement(dt);
  applyGroundEyeHeight();
  resolvePlayerCollisions();
  updateBoatInteractTarget();
  checkZoneTeleports();

  env.campground?.update(time, getWorldEye(), (event) => {
    if (event === "enter") {
      ui?.showToast("Inside the cabin — look at items and press E to interact");
    } else if (event === "exit") {
      ui?.showToast("Back at the campground");
    }
  });

  if (!inVR && env?.campground?.insideCabin && fishing.state === FishingState.IDLE) {
    cabinInteractTarget = env.campground.pickInteractable(camera);
  } else {
    cabinInteractTarget = null;
  }

  if (inVR) {
    if (fishing.state !== FishingState.REELING) {
      fishing.updateRodTransform(controllers[1], { swingVisual: fishing.vrWindupBend });
    }
  }

  const isReeling = fishing.state === FishingState.REELING;
  if (!inVR && reelHeld && isReeling) {
    fishing.reel(dt, 1);
  } else if (!inVR && isReeling) {
    fishing.updateReelIdle(dt);
  } else if (prevReelHeld) {
    fishing.stopReeling();
  }
  prevReelHeld = reelHeld && isReeling;

  if (isReeling) {
    const tensionOpts = { reelAssist: getState().settings?.reelAssist };
    const zone = tensionZone(fishing.tension, getRodStats(getState().rodLevel), tensionOpts);
    if ((zone === "warning" || zone === "snap") && zone !== lastTensionZone) {
      audio.playTensionWarning();
    }
    lastTensionZone = zone;
  } else if (!isReeling) {
    lastTensionZone = "sweet";
  }

  refreshStatus();

  fishing.update(dt, time);
  if (fishing.prospectFish) updateModelAnimations(fishing.prospectFish, dt);
  if (fishing.biteFish) updateModelAnimations(fishing.biteFish, dt);

  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (new URLSearchParams(location.search).has("playtest")) {
  window.__setPlaytestCamera = (x, y, z, lx, ly, lz) => {
    player.position.set(x, 0, z);
    camera.position.y = y;
    camera.lookAt(lx, ly, lz);
    const dx = lx - x;
    const dz = lz - z;
    const dy = ly - y;
    mouseX = Math.atan2(dx, dz);
    mouseY = Math.atan2(dy, Math.hypot(dx, dz));
    player.rotation.y = mouseX;
    camera.rotation.order = "YXZ";
    camera.rotation.y = 0;
    camera.rotation.x = mouseY;
  };

  window.__playtest = {
    getFishingState: () => fishing.state,
    getCamera: () => {
      const eye = getWorldEye();
      return { x: eye.x, y: eye.y, z: eye.z };
    },
    moveTo: (x, z) => {
      player.position.x = x;
      player.position.z = z;
      resolvePlayerCollisions();
    },
    cast: (power = 0.85) => {
      const aim = getAimDirection();
      return fishing.startCast(power, aim);
    },
    forceBite: () => {
      if (fishing.state === FishingState.WAITING) fishing.biteTimer = 0;
    },
    hook: () => {
      if (fishing.state === FishingState.BITING) fishing.hookFish();
    },
    reel: (intensity = 1) => {
      if (fishing.state === FishingState.REELING) fishing.reel(0.05, intensity);
    },
    getLineVisible: () => {
      const core = fishing.line?.getObjectByName?.("lineCore") || fishing.line;
      return Boolean(core?.geometry?.attributes?.position?.count > 2);
    },
    getLineDetail: () => {
      const core = fishing.line?.getObjectByName?.("lineCore") || fishing.line;
      return {
        meshVisible: Boolean(fishing.line?.visible),
        verts: core?.geometry?.attributes?.position?.count ?? 0,
        renderOrder: fishing.line?.renderOrder ?? 0,
      };
    },
    getBobberVisible: () => Boolean(fishing.bobber?.visible),
    getFishDetail: () => ({
      prospect: Boolean(fishing.prospectFish),
      prospectVisible: Boolean(fishing.prospectFish?.visible),
      prospectPos: fishing.prospectFish
        ? { x: fishing.prospectFish.position.x, y: fishing.prospectFish.position.y, z: fishing.prospectFish.position.z }
        : null,
      prospectSubmerged: (() => {
        if (!fishing.prospectFish) return false;
        const fx = fishing.prospectFish.position.x;
        const fz = fishing.prospectFish.position.z;
        const time = fishing.lastUpdateTime || performance.now() * 0.001;
        const surface = fishing.surfaceY(fx, fz, time);
        return fishing.prospectFish.position.y < surface - 0.03;
      })(),
      prospectShadow: Boolean(fishing.prospectFishShadow?.visible),
      biteFish: Boolean(fishing.biteFish),
      biteFishVisible: Boolean(fishing.biteFish?.visible),
      catchFish: fishing.state === "caught" && Boolean(fishing.biteFish),
      bitePos: fishing.biteFish
        ? { x: fishing.biteFish.position.x, y: fishing.biteFish.position.y, z: fishing.biteFish.position.z }
        : null,
      bobberPos: fishing.bobber?.visible
        ? { x: fishing.bobber.position.x, y: fishing.bobber.position.y, z: fishing.bobber.position.z }
        : null,
      casting: fishing.state === "casting",
      castAnim: fishing.castAnim,
    }),
    getPoolMarkerVisible: () => {
      const zone = getState().zone;
      return Boolean(env?.fishingPoolMarkers?.[zone]?.visible);
    },
    getHudText: () => document.getElementById("status-text")?.textContent || "",
    walk: (dirX, dirZ, duration = 1) => {
      const dt = 0.05;
      const moveSpeed = 4;
      const steps = Math.max(1, Math.ceil(duration / dt));
      const trace = [];
      for (let i = 0; i < steps; i++) {
        const dir = new THREE.Vector3(dirX, 0, dirZ);
        if (dir.lengthSq() > 0) dir.normalize();
        dir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouseX));
        const delta = dir.multiplyScalar(moveSpeed * dt);
        const feet = new THREE.Vector3(player.position.x, 0, player.position.z);
        if (env?.collisions) {
          const moved = moveWithCollisions(feet, delta, env.collisions);
          player.position.x = moved.x;
          player.position.z = moved.z;
        } else {
          player.position.x += delta.x;
          player.position.z += delta.z;
        }
        applyGroundEyeHeight();
        resolvePlayerCollisions();
        const eye = getWorldEye();
        const walkY = env?.getDockWalkEyeHeight?.(player.position.x, player.position.z);
        trace.push({
          x: eye.x,
          y: eye.y,
          z: eye.z,
          onStairs: walkY != null,
        });
      }
      return trace;
    },
    getStairsInfo: () => {
      const walkY = env?.getDockWalkEyeHeight?.(player.position.x, player.position.z) ?? null;
      const eye = getWorldEye();
      return {
        onStairs: walkY != null,
        eyeY: walkY,
        camera: { x: eye.x, y: eye.y, z: eye.z },
      };
    },
    waitFrames: (n) => new Promise((resolve) => {
      let left = n;
      const tick = () => {
        left -= 1;
        if (left <= 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
    listMeshes: (pattern = "boat|dock|Deep") => {
      const re = new RegExp(pattern, "i");
      const items = [];
      scene.traverse((obj) => {
        const path = [];
        let p = obj;
        while (p) {
          if (p.name) path.unshift(p.name);
          p = p.parent;
        }
        const fullName = path.join("/") || obj.type;
        if (!re.test(fullName)) return;
        const wp = new THREE.Vector3();
        obj.getWorldPosition(wp);
        items.push({
          name: fullName,
          type: obj.type,
          visible: obj.visible,
          x: +wp.x.toFixed(2),
          y: +wp.y.toFixed(2),
          z: +wp.z.toFixed(2),
        });
      });
      return items;
    },
  };
}
