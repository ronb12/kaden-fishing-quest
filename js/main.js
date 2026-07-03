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

let ui = null;
let touch = { active: false };

const canvas = document.getElementById("game-canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.6, 8);

let env = null;
let fishing = null;

const loadingEl = document.getElementById("asset-loading");
const loadingFill = document.getElementById("asset-loading-fill");
const loadingLabel = document.getElementById("asset-loading-label");

await loadGameAssets((progress, name) => {
  if (loadingFill) loadingFill.style.width = `${Math.round(progress * 100)}%`;
  if (loadingLabel) loadingLabel.textContent = name ? `Loading ${name.replace(/_/g, " ")}…` : "Loading assets…";
});
await audio.loadAudioAssets();
loadingEl?.classList.add("hidden");

env = new LakeEnvironment(scene);
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

document.body.appendChild(VRButton.createButton(renderer));

let inVR = false;
renderer.xr.addEventListener("sessionstart", () => {
  inVR = true;
  teleportToZone(getState().zone);
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

function performCast(power) {
  const aim = getAimDirection();
  if (inVR) {
    const swing = fishing.detectCastSwing(controllers[1]);
    const vrPower = Math.min(1, Math.max(0.3, 0.35 + swing * 12));
    fishing.startCast(vrPower, aim);
  } else {
    fishing.startCast(power, aim);
  }
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
  if (!inVR && !pointerLocked && !touch.active) canvas.requestPointerLock();
  audio.resumeAudio();
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
    if (touch.active) {
      performCast(0.75);
    } else if (!inVR) {
      castCharging = true;
      castCharge = 0;
    } else {
      performCast(0.75);
    }
  } else if (fs === FishingState.BITING) {
    fishing.hookFish();
  } else if (fs === FishingState.REELING) {
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
      ui?.setStatus(fishing.getStatusText());
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
  document.getElementById("status-text").textContent = "Drag right to look · joystick to move · tap Cast";
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
  }

  const rodOffset = new THREE.Vector3(0.38, -0.22, -0.32).applyQuaternion(camera.quaternion);
  fishing.updateRodTransform({
    position: camera.position.clone().add(rodOffset),
    quaternion: camera.quaternion,
  });
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

  env.update(time, dt);
  updateDesktopMovement(dt);
  checkZoneTeleports();

  if (inVR) {
    fishing.updateRodTransform(controllers[1]);
  }

  const isReeling = fishing.state === FishingState.REELING;
  if (reelHeld && isReeling) {
    fishing.reel(dt, 1);
  } else if (isReeling) {
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
