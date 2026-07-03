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
} from "./state.js";
import { BAITS, ZONES } from "./data.js";
import * as audio from "./audio.js";
import { initTouchControls } from "./touch-controls.js";
import { loadGameAssets, updateModelAnimations } from "./asset-loader.js";
import { loadEnvironmentMaps } from "./environment-loader.js";
import { VRFishingMotion } from "./vr-fishing.js";
import { VRHandRig } from "./vr-hands.js";
import { moveWithCollisions } from "./collisions.js";
import { BUILD_ID } from "./version.js";
import { DOCK_SPAWN } from "./dock-layout.js";
import { tensionZone } from "./fish-fight.js";
import { getRodStats } from "./gear-stats.js";

let ui = null;
let touch = { active: false };

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 280);
camera.position.set(DOCK_SPAWN.x, 1.6, DOCK_SPAWN.z);

let env = null;
let fishing = null;

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
const envMaps = await loadEnvironmentMaps(renderer);
loadingEl?.classList.add("hidden");

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

document.body.appendChild(VRButton.createButton(renderer));

let inVR = false;
renderer.xr.addEventListener("sessionstart", () => {
  inVR = true;
  vrMotion.resetCast();
  vrHands.setControllerModelsVisible(false);
  teleportToZone(getState().zone);
  ui?.setStatus(fishing.getStatusText(true));
  ui?.showToast("VR: right hand holds rod · left hand cranks reel when fighting fish");
});
renderer.xr.addEventListener("sessionend", () => {
  inVR = false;
  vrHands.setControllerModelsVisible(true);
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

function dismissLoadingHint() {
  if (gameStarted) return;
  gameStarted = true;
  document.querySelector(".loading-hint")?.classList.add("hidden");
  audio.resumeAudio();
  audio.startAmbient();
}

function refreshStatus() {
  if (!ui || inVR) return;
  if (cabinInteractTarget && fishing.state === FishingState.IDLE) {
    ui.setStatus(`[E] ${cabinInteractTarget.label}`);
    return;
  }
  if (castCharging && fishing.state === FishingState.IDLE) {
    const pct = Math.round((0.35 + castCharge * 0.65) * 100);
    ui.setStatus(`Charging cast… ${pct}% — release Space`);
    return;
  }
  if (fishing.state !== FishingState.IDLE) {
    ui.setStatus(fishing.getStatusText(inVR));
    return;
  }
  if (touch.active) {
    ui.setStatus("Hold Cast to charge · drag right to look · joystick to move");
  } else if (pointerLocked) {
    ui.setStatus("WASD move · hold Space to cast · hold R to reel · M menu · H guide");
  } else {
    ui.setStatus("Click to look · WASD to move · walk the boardwalk to the lake");
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
    case "fireplace":
      ui?.showToast(cg.toggleFireplace());
      break;
    case "trophy": {
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
      ui?.showToast("Soft radio static… lake forecast sounds calm");
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
  if (e.code === "KeyM") ui?.toggleMenu();
  if (e.code === "KeyH") ui?.openPanel?.("guide");
  if (e.code === "KeyB") ui?.openPanel?.("bait");
  if (e.code === "KeyE") tryCabinInteract();
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

function onFishingEvent(type, data) {
  switch (type) {
    case "cast":
      ui?.onTutorialTrigger?.("cast");
      ui?.showContextualTip?.("first_cast");
      ui?.setStatus(fishing.getStatusText(inVR));
      break;
    case "nibble":
      ui?.onTutorialTrigger?.("nibble");
      ui?.showContextualTip?.("nibble");
      ui?.setStatus(fishing.getStatusText(inVR));
      vibrate(12);
      break;
    case "preBite":
      ui?.showContextualTip?.("preBite");
      audio.playPreBite();
      ui?.setStatus(fishing.getStatusText());
      vibrate(30);
      break;
    case "bite":
      ui?.onTutorialTrigger?.("bite");
      ui?.showContextualTip?.("bite");
      ui?.setBiteAlert(true, data.species?.name, 1);
      ui?.setStatus(fishing.getStatusText());
      if (data.legendary) {
        ui?.showToast("⚡ LEGENDARY FISH nearby!");
        vibrate([80, 40, 80]);
      } else {
        ui?.showToast(`${data.species?.name} is biting!`);
        vibrate(60);
      }
      break;
    case "biteTick":
      ui?.setBiteAlert(true, data.species?.name, data.progress);
      break;
    case "hooked":
      ui?.onTutorialTrigger?.("hooked");
      ui?.showContextualTip?.("hooked");
      ui?.setBiteAlert(false);
      ui?.setReelAlert(true);
      ui?.setStatus(fishing.getStatusText(inVR));
      ui?.setTension(fishing.tension, fishing.reelProgress, true, {
        phaseLabel: fishing.fightPhaseLabel,
      });
      break;
    case "reeling":
      ui?.checkTensionTip?.(
        tensionZone(data.tension, getRodStats(getState().rodLevel)),
        data.phase
      );
      ui?.setTension(data.tension, data.progress, true, {
        phase: data.phase,
        phaseLabel: data.phaseLabel,
      });
      ui?.setStatus(fishing.getStatusText(inVR));
      if (data.phaseChanged && inVR) {
        const strong = data.phase === "run" || data.phase === "thrash" || data.phase === "surge";
        vrMotion.pulseHaptic(controllers[1], strong ? 0.55 : 0.25, strong ? 55 : 30);
      }
      break;
    case "caught":
      ui?.onTutorialTrigger?.("caught");
      ui?.showContextualTip?.("caught");
      if (data.isNewSpecies && data.speciesId) {
        ui?.showSpeciesCatchTip?.(data.speciesId);
      }
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
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
      if (data.reason === "snap") ui?.showContextualTip?.("failed_snap");
      else if (data.reason === "escape") ui?.showContextualTip?.("failed_escape");
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      ui?.setTension(0, 0, false);
      ui?.setStatus(data.message);
      ui?.showToast(data.message);
      break;
    case "reset":
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      ui?.setTension(0, 0, false);
      ui?.setStatus(fishing.getStatusText(inVR));
      vrMotion.resetCast();
      break;
    default:
      ui?.setStatus(fishing.getStatusText());
  }
  updateTouchUI();
}

function switchZone(zoneId) {
  if (!canAccessZone(zoneId)) {
    ui?.showToast(`Upgrade boat to access ${zoneId}`);
    return;
  }
  setZone(zoneId);
  teleportToZone(zoneId);
  env.applyZone(zoneId);
  ui?.showToast(`Now at ${zoneId}`);
}

function aimAtFishingPool(zone) {
  if (!zone) return;
  const look = new THREE.Vector3(
    zone.lookAt?.x ?? zone.castCenter.x,
    zone.lookAt?.y ?? 0.4,
    zone.lookAt?.z ?? zone.castCenter.z
  );
  camera.lookAt(look);
  const dx = look.x - camera.position.x;
  const dz = look.z - camera.position.z;
  const dy = look.y - camera.position.y;
  mouseX = Math.atan2(dx, dz);
  mouseY = Math.atan2(dy, Math.hypot(dx, dz));
  mouseY = Math.max(-1.2, Math.min(1.2, mouseY));
}

function applyGroundEyeHeight() {
  if (inVR) return;
  let y = 1.6;
  const stairY = env?.getDockWalkEyeHeight?.(camera.position.x, camera.position.z);
  if (stairY != null) y = stairY;
  camera.position.y = y;
}

function teleportToZone(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) return;
  const offset = new THREE.Vector3(zone.teleport.x, zone.teleport.y + 1.6, zone.teleport.z);
  camera.position.copy(offset);
  applyGroundEyeHeight();
  aimAtFishingPool(zone);
}

ui = initUI(fishing, {
  onEnterVR: () => {},
  isVR: () => inVR,
  onZoneChange: (zone) => {
    teleportToZone(zone);
    env.applyZone(zone);
  },
  onRodUpgrade: () => {
    fishing.onRodLevelUp();
    audio.playUpgrade();
  },
  onBaitChange: () => fishing.onBaitChanged(),
  onSettingsChange: (settings) => {
    audio.applyAudioSettings(settings);
    env.setQuality(settings.quality || "high");
    const pr = settings.quality === "low" ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
  },
  onCastAgain: () => performCast(0.75),
});

await initState();
audio.applyAudioSettings(getState().settings);
env.setQuality(getState().settings?.quality || "high");
teleportToZone(getState().zone);
env.applyZone(getState().zone);

subscribe((state) => {
  ui?.updateSyncStatus?.();
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

const clock = new THREE.Clock();
const moveSpeed = 4;
const WORLD_BOUNDS = 45;

function updateDesktopMovement(dt) {
  if (inVR) return;
  camera.rotation.order = "YXZ";
  camera.rotation.y = mouseX;
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
    if (env?.collisions) {
      camera.position.copy(moveWithCollisions(camera.position, delta, env.collisions));
    } else {
      camera.position.add(delta);
    }
    if (env?.collisions) {
      camera.position.copy(env.collisions.resolve(camera.position));
    }
    camera.position.x = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, camera.position.x));
    camera.position.z = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, camera.position.z));
    applyGroundEyeHeight();
    if (env?.collisions) {
      camera.position.copy(env.collisions.resolve(camera.position));
    }
    if (fishing.state === FishingState.WAITING) {
      fishing.addLureMotion(dt * 0.35);
    }
  } else if (fishing.state === FishingState.WAITING && (Math.abs(mouseX) > 0.01 || Math.abs(mouseY) > 0.01)) {
    fishing.addLureMotion(dt * 0.12);
  }

  // Slight right bias, mostly forward — first-person rod hold in front of chest
  const rodOffset = new THREE.Vector3(0.14, -0.34, -0.64).applyQuaternion(camera.quaternion);
  fishing.updateRodTransform(
    {
      position: camera.position.clone().add(rodOffset),
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
  updateVrFishing(dt);
  updateDesktopMovement(dt);
  applyGroundEyeHeight();
  checkZoneTeleports();

  env.campground?.update(time, camera.position, (event) => {
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

  if (isReeling && !inVR) {
    const zone = tensionZone(fishing.tension, getRodStats(getState().rodLevel));
    if ((zone === "warning" || zone === "snap") && zone !== lastTensionZone) {
      audio.playTensionWarning();
    }
    lastTensionZone = zone;
  } else if (!isReeling) {
    lastTensionZone = "sweet";
  }

  refreshStatus();

  fishing.update(dt, time);
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
    camera.position.set(x, y, z);
    camera.lookAt(lx, ly, lz);
    const dx = lx - x;
    const dz = lz - z;
    const dy = ly - y;
    mouseX = Math.atan2(dx, dz);
    mouseY = Math.atan2(dy, Math.hypot(dx, dz));
  };

  window.__playtest = {
    getFishingState: () => fishing.state,
    getCamera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    moveTo: (x, z) => {
      camera.position.x = x;
      camera.position.z = z;
      if (env?.collisions) camera.position.copy(env.collisions.resolve(camera.position));
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
    getLineVisible: () => Boolean(fishing.line?.geometry?.attributes?.position?.count > 2),
    getLineDetail: () => ({
      meshVisible: Boolean(fishing.line?.visible),
      verts: fishing.line?.geometry?.attributes?.position?.count ?? 0,
      renderOrder: fishing.line?.renderOrder ?? 0,
    }),
    getBobberVisible: () => Boolean(fishing.bobber?.visible),
    getFishDetail: () => ({
      prospect: Boolean(fishing.prospectFish),
      prospectVisible: Boolean(fishing.prospectFish?.visible),
      prospectPos: fishing.prospectFish
        ? { x: fishing.prospectFish.position.x, y: fishing.prospectFish.position.y, z: fishing.prospectFish.position.z }
        : null,
      prospectSubmerged: (() => {
        if (!fishing.prospectFish) return false;
        const bx = fishing.bobber?.visible ? fishing.bobber.position.x : fishing.hookGroup?.position.x;
        const bz = fishing.bobber?.visible ? fishing.bobber.position.z : fishing.hookGroup?.position.z;
        if (bx == null) return false;
        const surface = fishing.surfaceY(bx, bz, performance.now() * 0.001);
        return fishing.prospectFish.position.y < surface - 0.04;
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
        if (env?.collisions) {
          camera.position.copy(moveWithCollisions(camera.position, delta, env.collisions));
        } else {
          camera.position.add(delta);
        }
        camera.position.y = 1.6;
        const walkY = env?.getDockWalkEyeHeight?.(camera.position.x, camera.position.z);
        if (walkY != null) camera.position.y = walkY;
        trace.push({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          onStairs: walkY != null,
        });
      }
      return trace;
    },
    getStairsInfo: () => {
      const walkY = env?.getDockWalkEyeHeight?.(camera.position.x, camera.position.z) ?? null;
      return {
        onStairs: walkY != null,
        eyeY: walkY,
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
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
  };
}
