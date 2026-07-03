import * as THREE from "three";
import { ZONES, pickFish, rollWeight, formatCatch, getBait } from "./data.js";
import { getState, recordCatch, getSelectedBait } from "./state.js";
import * as audio from "./audio.js";
import { buildRealisticRod, buildBaitMesh, buildBobber, buildHook, buildBiteFish, buildSplashRing } from "./rod-model.js";

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
    this.rodTip = null;
    this.bobber = null;
    this.hookGroup = null;
    this.baitMesh = null;
    this.line = null;
    this.castTarget = new THREE.Vector3();
    this.biteTimer = 0;
    this.biteWindow = 0;
    this.tension = 0;
    this.reelProgress = 0;
    this.pendingFish = null;
    this.castPower = 0;
    this.lastControllerPos = new THREE.Vector3();
    this.biteFish = null;
    this.splashRings = [];
    this.biteLunge = 0;
    this.catchAnim = 0;
    this.resetTimer = 0;
    this.rebuildRod();
    scene.add(this.rodGroup);
  }

  rebuildRod() {
    while (this.rodGroup.children.length) {
      this.rodGroup.remove(this.rodGroup.children[0]);
    }
    const { rod } = buildRealisticRod(getState().rodLevel);
    while (rod.children.length) {
      this.rodGroup.add(rod.children[0]);
    }
    this.rodTip = this.rodGroup.getObjectByName("rodTip");
    this.rodGroup.scale.setScalar(1.1);

    if (!this.line) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      this.line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.85 })
      );
      this.scene.add(this.line);
    }

    if (!this.bobber) {
      this.bobber = buildBobber();
      this.bobber.visible = false;
      this.scene.add(this.bobber);
    }

    if (!this.hookGroup) {
      this.hookGroup = new THREE.Group();
      this.hookGroup.add(buildHook());
      this.hookGroup.visible = false;
      this.scene.add(this.hookGroup);
    }

    this.updateBaitVisual();
  }

  updateBaitVisual() {
    if (this.baitMesh) {
      this.hookGroup?.remove(this.baitMesh);
      this.baitMesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    const bait = getSelectedBait();
    this.baitMesh = buildBaitMesh(bait);
    this.baitMesh.position.y = -0.028;
    this.hookGroup?.add(this.baitMesh);
  }

  attachToController(controller) {
    this.controller = controller;
  }

  getRodTipWorld() {
    const pos = new THREE.Vector3();
    if (this.rodTip) this.rodTip.getWorldPosition(pos);
    return pos;
  }

  updateRodTransform(controller) {
    if (!controller) return;
    this.rodGroup.position.copy(controller.position);
    this.rodGroup.quaternion.copy(controller.quaternion);
    this.rodGroup.rotateX(-Math.PI / 3.2, true);
    this.rodGroup.rotateY(0.14, true);
    this.rodGroup.rotateZ(-0.06, true);
  }

  surfaceY(x, z, time) {
    return 0.06 + this.env.getWaterHeight(x, z, time);
  }

  updateLine() {
    const tip = this.getRodTipWorld();
    const points = [tip.clone()];

    if (this.bobber.visible) {
      points.push(this.bobber.position.clone());
      if (this.hookGroup.visible) {
        const hookPos = new THREE.Vector3();
        this.hookGroup.getWorldPosition(hookPos);
        points.push(hookPos);
      }
    } else if (this.hookGroup.visible) {
      const hookPos = new THREE.Vector3();
      this.hookGroup.getWorldPosition(hookPos);
      points.push(hookPos);
    } else {
      const end = tip.clone();
      end.y -= 0.15;
      points.push(end);
    }

    this.line.geometry.setFromPoints(points);
  }

  showRigAtTip() {
    const tip = this.getRodTipWorld();
    this.hookGroup.position.copy(tip);
    this.hookGroup.position.y -= 0.04;
    this.hookGroup.visible = this.state === FishingState.IDLE;
    this.bobber.visible = this.state !== FishingState.IDLE && this.state !== FishingState.CAUGHT && this.state !== FishingState.FAILED;
  }

  startCast(power = 0.7) {
    if (this.state !== FishingState.IDLE) return false;
    const s = getState();
    const zone = ZONES[s.zone];
    if (!zone) return false;

    const bait = getSelectedBait();
    this.castPower = Math.min(1, Math.max(0.2, power));
    this.state = FishingState.CASTING;
    this.hookGroup.visible = false;
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
      this.hookGroup.position.copy(this.castTarget);
      this.hookGroup.position.y = 0.02;
      this.hookGroup.visible = true;
      audio.playSplash();
      this.state = FishingState.WAITING;
      const waitTime = Math.max(0.8, 1.5 + Math.random() * 4 - s.baitKit * 0.2 - bait.waitBonus);
      this.biteTimer = waitTime;
      this.onEvent?.("cast", { target: this.castTarget.clone(), bait });
    }, 400);

    return true;
  }

  update(dt, time) {
    this.showRigAtTip();
    this.updateLine();

    if (this.bobber.visible && this.state !== FishingState.IDLE && this.state !== FishingState.CAUGHT) {
      const waterY = this.surfaceY(this.bobber.position.x, this.bobber.position.z, time);
      this.bobber.position.y = waterY + Math.sin(time * 3) * 0.015;
      this.hookGroup.position.copy(this.bobber.position);
      this.hookGroup.position.y -= 0.05;
      if (this.state === FishingState.BITING) {
        this.bobber.position.y += Math.sin(time * 12) * 0.05;
        this.bobber.rotation.z = Math.sin(time * 14) * 0.18;
        this.updateBiteFish(dt, time);
      }

      if (this.state === FishingState.REELING) {
        this.updateFightFish(dt, time);
      }
    }

    if (this.state === FishingState.CAUGHT) {
      this.updateCatchAnim(dt, time);
    }

    if (this.state === FishingState.FAILED) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) this.reset();
    }

    this.updateSplashRings(dt);

    if (this.state === FishingState.WAITING) {
      this.biteTimer -= dt;
      if (this.biteTimer <= 0) this.triggerBite();
    }

    if (this.state === FishingState.BITING) {
      this.biteWindow -= dt;
      this.onEvent?.("biteTick", {
        progress: Math.max(0, this.biteWindow / this.biteWindowMax),
        species: this.pendingFish,
      });
      if (this.biteWindow <= 0) {
        this.failCatch("Fish got away — hook it faster next time!");
      }
    }

    if (this.state === FishingState.REELING) {
      this.reelProgress += dt * (0.15 + getState().rodLevel * 0.03);
      if (this.reelProgress >= 1) this.completeCatch();
    }
  }

  triggerBite() {
    const s = getState();
    this.pendingFish = pickFish(s.zone, s.rodLevel, s.baitKit, s.selectedBait);
    this.state = FishingState.BITING;
    this.biteWindow = 2.5 + s.rodLevel * 0.2;
    this.biteWindowMax = this.biteWindow;
    this.spawnBiteFish();
    this.spawnSplash();
    audio.playBite();
    this.onEvent?.("bite", { species: this.pendingFish });
  }

  spawnBiteFish() {
    this.clearBiteFish();
    this.biteFish = buildBiteFish(this.pendingFish);
    const pos = this.bobber.position;
    const surface = this.surfaceY(pos.x, pos.z, 0);
    this.biteFish.position.set(pos.x + 0.55, surface - 0.06, pos.z + 0.35);
    this.biteFish.lookAt(pos.x, surface + 0.02, pos.z);
    this.biteLunge = 0;
    this.scene.add(this.biteFish);
  }

  updateBiteFish(dt, time) {
    if (!this.biteFish) return;
    const bx = this.bobber.position.x;
    const bz = this.bobber.position.z;
    const surface = this.surfaceY(bx, bz, time);
    const target = new THREE.Vector3(bx + 0.08, surface - 0.02, bz + 0.05);
    this.biteLunge = Math.min(1, this.biteLunge + dt * 2.2);
    const start = new THREE.Vector3(bx + 0.55, surface - 0.06, bz + 0.35);
    this.biteFish.position.lerpVectors(start, target, this.biteLunge);
    this.biteFish.lookAt(bx, this.bobber.position.y, bz);
    this.biteFish.rotation.z = Math.sin(this.biteLunge * 22) * 0.18;
    if (this.biteLunge > 0.55 && Math.random() < dt * 2) this.spawnSplash();
  }

  updateFightFish(dt, time) {
    if (!this.biteFish) return;
    const bx = this.bobber.position.x;
    const bz = this.bobber.position.z;
    const surface = this.surfaceY(bx, bz, time);
    const pull = new THREE.Vector3(
      bx - 0.12,
      surface - 0.08 + this.reelProgress * 0.55 + Math.sin(time * 9) * 0.14,
      bz - 0.08
    );
    this.biteFish.position.lerp(pull, dt * 4);
    this.biteFish.lookAt(bx, this.bobber.position.y, bz);
    this.biteFish.rotation.z = Math.sin(time * 11) * 0.35;
    if (this.biteFish.position.y > surface - 0.02 && Math.random() < dt * 3) {
      this.spawnSplash();
    }
  }

  updateCatchAnim(dt, time) {
    if (!this.biteFish) {
      this.biteFish = buildBiteFish(this.pendingFish);
      this.biteFish.position.copy(this.bobber.position);
      this.scene.add(this.biteFish);
    }
    this.catchAnim += dt;
    const t = this.catchAnim;
    const bx = this.bobber.position.x;
    const bz = this.bobber.position.z;
    const surface = this.surfaceY(bx, bz, time);
    const jump = Math.sin(Math.min(1, t * 0.9) * Math.PI) * 1.4;
    const sway = Math.sin(t * 4) * 0.2;
    this.biteFish.position.set(bx + sway, surface + 0.15 + jump, bz + Math.cos(t * 3) * 0.15);
    this.biteFish.rotation.y += dt * 3.5;
    this.biteFish.rotation.z = Math.sin(t * 10) * 0.45;
    if (t > 0.15 && t < 0.35) this.spawnSplash();
    if (t >= 2.8) this.reset();
  }

  spawnSplash() {
    for (let i = 0; i < 3; i++) {
      const ring = buildSplashRing();
      ring.position.copy(this.bobber.position);
      ring.position.y = 0.04;
      ring.userData = { age: i * 0.15, maxAge: 0.9 };
      this.scene.add(ring);
      this.splashRings.push(ring);
    }
  }

  updateSplashRings(dt) {
    this.splashRings = this.splashRings.filter((ring) => {
      ring.userData.age += dt;
      const t = ring.userData.age / ring.userData.maxAge;
      if (t >= 1) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        return false;
      }
      const scale = 1 + t * 4;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = 0.7 * (1 - t);
      return true;
    });
  }

  clearBiteFish() {
    if (this.biteFish) {
      this.scene.remove(this.biteFish);
      this.biteFish.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this.biteFish = null;
    }
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
    if (this.reelProgress >= 1) this.completeCatch();
    this.onEvent?.("reeling", { tension: this.tension, progress: this.reelProgress });
  }

  completeCatch() {
    if (!this.pendingFish || this.state === FishingState.CAUGHT) return;
    const s = getState();
    const bait = getSelectedBait();
    const weight = rollWeight(this.pendingFish);
    const catchData = formatCatch(this.pendingFish, weight, s.zone);
    catchData.baitUsed = bait.name;
    recordCatch(catchData);
    audio.playCatch();
    this.state = FishingState.CAUGHT;
    this.catchAnim = 0;
    this.bobber.visible = false;
    this.spawnSplash();
    this.spawnSplash();
    this.onEvent?.("caught", catchData);
  }

  failCatch(message) {
    if (this.state === FishingState.FAILED || this.state === FishingState.CAUGHT) return;
    audio.playFail();
    this.state = FishingState.FAILED;
    this.resetTimer = 2;
    this.onEvent?.("failed", { message });
  }

  reset() {
    this.state = FishingState.IDLE;
    this.bobber.visible = false;
    this.hookGroup.visible = true;
    this.pendingFish = null;
    this.tension = 0;
    this.reelProgress = 0;
    this.biteTimer = 0;
    this.catchAnim = 0;
    this.resetTimer = 0;
    this.bobber.rotation.z = 0;
    this.clearBiteFish();
    this.splashRings.forEach((ring) => {
      this.scene.remove(ring);
      ring.geometry?.dispose();
      ring.material?.dispose();
    });
    this.splashRings = [];
    this.onEvent?.("reset");
  }

  onRodLevelUp() {
    this.rebuildRod();
  }

  onBaitChanged() {
    this.updateBaitVisual();
  }

  detectCastSwing(controller) {
    if (!controller) return 0;
    const vel = controller.position.distanceTo(this.lastControllerPos);
    this.lastControllerPos.copy(controller.position);
    return vel;
  }

  getStatusText() {
    const bait = getSelectedBait();
    switch (this.state) {
      case FishingState.IDLE:
        return `Ready — ${bait.name} on hook · cast (trigger / Space)`;
      case FishingState.CASTING:
        return "Casting...";
      case FishingState.WAITING:
        return `Waiting with ${bait.name}...`;
      case FishingState.BITING:
        return `BITE! ${this.pendingFish?.name || "Fish"} — hook now (Space / trigger)`;
      case FishingState.REELING:
        return `Hooked! Hold R / trigger to reel — watch tension`;
      case FishingState.CAUGHT:
        return "Nice catch!";
      case FishingState.FAILED:
        return "Better luck next cast.";
      default:
        return "";
    }
  }
}
