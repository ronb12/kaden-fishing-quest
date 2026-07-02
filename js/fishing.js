import * as THREE from "three";
import { ZONES, pickFish, rollWeight, formatCatch } from "./data.js";
import { getState, recordCatch } from "./state.js";
import * as audio from "./audio.js";

export const FishingState = {
  IDLE: "idle",
  CASTING: "casting",
  WAITING: "waiting",
  BITING: "biting",
  REELING: "reeling",
  CAUGHT: "caught",
  FAILED: "failed",
};

export class FishingSystem {
  constructor(scene, env, onEvent) {
    this.scene = scene;
    this.env = env;
    this.onEvent = onEvent;
    this.state = FishingState.IDLE;
    this.rodGroup = new THREE.Group();
    this.bobber = null;
    this.line = null;
    this.castTarget = new THREE.Vector3();
    this.biteTimer = 0;
    this.biteWindow = 0;
    this.tension = 0;
    this.reelProgress = 0;
    this.pendingFish = null;
    this.castPower = 0;
    this.lastControllerPos = new THREE.Vector3();
    this.buildRod();
    scene.add(this.rodGroup);
  }

  buildRod() {
    const rodMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.6 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x2a1810 });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.18), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = -0.09;
    this.rodGroup.add(handle);

    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 1.4), rodMat);
    blank.rotation.x = Math.PI / 2;
    blank.position.z = -0.8;
    this.rodGroup.add(blank);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
    tip.position.set(0, 0, -1.55);
    this.rodGroup.add(tip);
    this.rodTip = tip;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xeeeeee, linewidth: 1 });
    this.line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this.line);

    const bobberGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const bobberMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x440000, emissiveIntensity: 0.2 });
    this.bobber = new THREE.Mesh(bobberGeo, bobberMat);
    this.bobber.visible = false;
    this.scene.add(this.bobber);
  }

  attachToController(controller) {
    this.controller = controller;
  }

  getRodTipWorld() {
    const pos = new THREE.Vector3();
    this.rodTip.getWorldPosition(pos);
    return pos;
  }

  updateRodTransform(controller) {
    if (!controller) return;
    this.rodGroup.position.copy(controller.position);
    this.rodGroup.quaternion.copy(controller.quaternion);
    this.rodGroup.rotateX(-Math.PI / 4, true);
  }

  updateLine() {
    const tip = this.getRodTipWorld();
    const points = [tip.clone()];
    if (this.bobber.visible) {
      points.push(this.bobber.position.clone());
    } else {
      const end = tip.clone();
      end.y -= 0.3;
      points.push(end);
    }
    this.line.geometry.setFromPoints(points);
  }

  startCast(power = 0.7) {
    if (this.state !== FishingState.IDLE) return false;
    const s = getState();
    const zone = ZONES[s.zone];
    if (!zone) return false;

    this.castPower = Math.min(1, Math.max(0.2, power));
    this.state = FishingState.CASTING;
    audio.playCast();

    const angle = Math.random() * Math.PI * 2;
    const dist = zone.castRadius * this.castPower * 0.5 + zone.castRadius * 0.3;
    this.castTarget.set(
      zone.castCenter.x + Math.cos(angle) * dist,
      0,
      zone.castCenter.z + Math.sin(angle) * dist
    );

    setTimeout(() => {
      this.bobber.position.copy(this.castTarget);
      this.bobber.position.y = 0.08;
      this.bobber.visible = true;
      audio.playSplash();
      this.state = FishingState.WAITING;
      const waitTime = 1.5 + Math.random() * 4 - s.baitKit * 0.2;
      this.biteTimer = waitTime;
      this.onEvent?.("cast", { target: this.castTarget.clone() });
    }, 400);

    return true;
  }

  update(dt, time) {
    this.updateLine();

    if (this.bobber.visible && this.state !== FishingState.IDLE) {
      const w = this.env.getWaterHeight(this.bobber.position.x, this.bobber.position.z, time);
      this.bobber.position.y = 0.06 + w + Math.sin(time * 3) * 0.01;
      if (this.state === FishingState.BITING) {
        this.bobber.position.y += Math.sin(time * 12) * 0.04;
      }
    }

    if (this.state === FishingState.WAITING) {
      this.biteTimer -= dt;
      if (this.biteTimer <= 0) {
        this.triggerBite();
      }
    }

    if (this.state === FishingState.BITING) {
      this.biteWindow -= dt;
      if (this.biteWindow <= 0) {
        this.failCatch("Fish got away — hook it faster next time!");
      }
    }

    if (this.state === FishingState.REELING) {
      this.reelProgress += dt * (0.15 + getState().rodLevel * 0.03);
      if (this.reelProgress >= 1) {
        this.completeCatch();
      }
    }
  }

  triggerBite() {
    const s = getState();
    this.pendingFish = pickFish(s.zone, s.rodLevel, s.baitKit);
    this.state = FishingState.BITING;
    this.biteWindow = 2.5 + s.rodLevel * 0.2;
    audio.playBite();
    this.onEvent?.("bite", { species: this.pendingFish });
  }

  hookFish() {
    if (this.state !== FishingState.BITING) return false;
    this.state = FishingState.REELING;
    this.tension = 0.3;
    this.reelProgress = 0;
    this.onEvent?.("hooked", { species: this.pendingFish });
    return true;
  }

  reel(dt, intensity = 1) {
    if (this.state !== FishingState.REELING) return;
    audio.playReel();
    const s = getState();
    const fishFight = (this.pendingFish?.rarity === "legendary" ? 0.08 : 0.05) * dt * 60;
    this.tension += intensity * 0.12 - fishFight;
    this.tension = Math.max(0, Math.min(1, this.tension));
    this.reelProgress += dt * (0.08 + s.rodLevel * 0.02) * intensity;

    if (this.tension >= 0.95) {
      this.failCatch("Line snapped — ease up on the tension!");
      return;
    }
    if (this.tension < 0.1) {
      this.failCatch("Fish shook the hook — keep reeling!");
      return;
    }
    if (this.reelProgress >= 1) {
      this.completeCatch();
    }
    this.onEvent?.("reeling", { tension: this.tension, progress: this.reelProgress });
  }

  completeCatch() {
    if (!this.pendingFish) return;
    const s = getState();
    const weight = rollWeight(this.pendingFish);
    const catchData = formatCatch(this.pendingFish, weight, s.zone);
    recordCatch(catchData);
    audio.playCatch();
    this.state = FishingState.CAUGHT;
    this.onEvent?.("caught", catchData);
    setTimeout(() => this.reset(), 2500);
  }

  failCatch(message) {
    audio.playFail();
    this.state = FishingState.FAILED;
    this.onEvent?.("failed", { message });
    setTimeout(() => this.reset(), 2000);
  }

  reset() {
    this.state = FishingState.IDLE;
    this.bobber.visible = false;
    this.pendingFish = null;
    this.tension = 0;
    this.reelProgress = 0;
    this.biteTimer = 0;
    this.onEvent?.("reset");
  }

  detectCastSwing(controller) {
    if (!controller) return 0;
    const vel = controller.position.distanceTo(this.lastControllerPos);
    this.lastControllerPos.copy(controller.position);
    return vel;
  }

  getStatusText() {
    switch (this.state) {
      case FishingState.IDLE:
        return "Ready — cast your line (trigger / Space)";
      case FishingState.CASTING:
        return "Casting...";
      case FishingState.WAITING:
        return "Waiting for a bite...";
      case FishingState.BITING:
        return "BITE! Hook now (trigger / Space)";
      case FishingState.REELING:
        return `Reeling — tension ${Math.round(this.tension * 100)}%`;
      case FishingState.CAUGHT:
        return "Nice catch!";
      case FishingState.FAILED:
        return "Better luck next cast.";
      default:
        return "";
    }
  }
}
