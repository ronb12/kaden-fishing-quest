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
import { BUILD_ID } from "./version.js";
import { DOCK_SPAWN } from "./dock-layout.js";

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
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
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

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  controller.addEventListener("selectstart", () => onSelect(i));
  controller.addEventListener("selectend", () => onSelectEnd(i));
  if (i === 0) controller.addEventListener("squeezestart", () => ui?.toggleMenu());
  scene.add(controller);
  controllers.push(controller);

  const grip = renderer.xr.getControllerGrip(i);
  const model = controllerModelFactory.createControllerModel(grip);
  grip.add(model);
  scene.add(grip);
}

fishing.attachToController(controllers[1]);
const vrMotion = new VRFishingMotion();

document.body.appendChild(VRButton.createButton(renderer));

let inVR = false;
renderer.xr.addEventListener("sessionstart", () => {
  inVR = true;
  vrMotion.resetCast();
  teleportToZone(getState().zone);
  ui?.setStatus(fishing.getStatusText(true));
  ui?.showToast("VR: pull back and swing to cast · crank wrist to reel");
});
renderer.xr.addEventListener("sessionend", () => {
  inVR = false;
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
  if (e.code === "KeyB") ui?.openPanel?.("bait");
  if (e.code === "KeyE") tryCabinInteract();
  const baitKeyMap = { Digit4: 0, Digit5: 1, Digit6: 2, Digit7: 3, Digit8: 4, Digit9: 5 };
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
  audio.resumeAudio();
  if (!inVR && !touch.active) {
    if (env?.campground?.insideCabin && tryCabinInteract()) return;
    if (!pointerLocked) canvas.requestPointerLock();
  }
});
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
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
      performCast(0.75);
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
    case "preBite":
      ui?.setStatus(fishing.getStatusText());
      vibrate(30);
      break;
    case "bite":
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
      ui?.setBiteAlert(false);
      ui?.setReelAlert(true);
      ui?.setStatus(fishing.getStatusText());
      ui?.setTension(fishing.tension, fishing.reelProgress, true);
      break;
    case "reeling":
      ui?.setTension(data.tension, data.progress, true);
      ui?.setStatus(fishing.getStatusText());
      break;
    case "caught":
      ui?.setBiteAlert(false);
      ui?.setReelAlert(false);
      ui?.showCatch(data, () => performCast(0.75));
      ui?.setTension(0, 0, false);
      ui?.setStatus(fishing.getStatusText());
      break;
    case "failed":
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

function teleportToZone(zoneId) {
  const zone = ZONES[zoneId];
  if (!zone) return;
  const offset = new THREE.Vector3(zone.teleport.x, zone.teleport.y + 1.6, zone.teleport.z);
  camera.position.copy(offset);
  const look = new THREE.Vector3(zone.lookAt.x, 1.6, zone.lookAt.z);
  camera.lookAt(look);
  mouseX = Math.atan2(look.x - camera.position.x, look.z - camera.position.z);
  mouseY = 0;
}

ui = initUI(fishing, {
  onEnterVR: () => {},
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
    camera.position.add(dir.multiplyScalar(moveSpeed * dt));
    camera.position.y = 1.6;
    camera.position.x = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, camera.position.x));
    camera.position.z = Math.max(-WORLD_BOUNDS, Math.min(WORLD_BOUNDS, camera.position.z));
    if (env.campground) {
      camera.position.copy(env.campground.resolveCollisions(camera.position));
    }
  }

  const rodOffset = new THREE.Vector3(0.45, -0.24, -0.55).applyQuaternion(camera.quaternion);
  fishing.updateRodTransform({
    position: camera.position.clone().add(rodOffset),
    quaternion: camera.quaternion,
  });
}

function updateVrFishing(dt) {
  if (!inVR) return;

  const motion = vrMotion.update(
    controllers[1],
    camera,
    fishing.rodGroup,
    dt,
    fishing.state
  );

  fishing.setVrWindup(motion.swingVisual);

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
    if (cabinInteractTarget) {
      ui?.setStatus(`[E] ${cabinInteractTarget.label}`);
    }
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
  };
}
