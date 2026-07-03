import * as THREE from "three";
import { ZONES, pickFish, rollWeight, formatCatch, getBait } from "./data.js";
import { getState, recordCatch, getSelectedBait } from "./state.js";
import * as audio from "./audio.js";
import { buildRealisticRod, buildBaitMesh, buildBobber, buildHook, buildBiteFish, buildSplashRing, buildFishingLine, linePointsWithSag } from "./rod-model.js";

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
    this.castAnim = 0;
    this.preBiteWarned = false;
    this.escapeTimer = 0;
    this.legendaryEvent = false;
    this.failReason = "default";
    this.baseRodRotation = { x: -0.55, y: 0.18, z: -0.08 };
    this.rodBend = 0;
    this.rebuildRod();
    scene.add(this.rodGroup);
  }

  rebuildRod() {
    while (this.rodGroup.children.length) {
      this.rodGroup.remove(this.rodGroup.children[0]);
    }
    const { rod, tip } = buildRealisticRod(getState().rodLevel);
    this.rodGroup.add(rod);
    this.rodTip = tip || rod.getObjectByName("rodTip");

    if (!this.line) {
      this.line = buildFishingLine();
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
    const castSwing = this.state === FishingState.CASTING ? Math.sin(this.castAnim * Math.PI) * 0.45 : 0;
    const fightBend = this.state === FishingState.REELING ? this.tension * 0.22 : 0;
    const biteBend = this.state === FishingState.BITING ? 0.12 : 0;
    this.rodBend += ((fightBend + biteBend) - this.rodBend) * 0.12;
    this.rodGroup.rotateX(this.baseRodRotation.x - castSwing + this.rodBend, true);
    this.rodGroup.rotateY(this.baseRodRotation.y, true);
    this.rodGroup.rotateZ(this.baseRodRotation.z, true);
  }

  surfaceY(x, z, time) {
    return 0.06 + this.env.getWaterHeight(x, z, time);
  }

  updateLine() {
    const tip = this.getRodTipWorld();
    const segments = [];

    if (this.bobber.visible) {
      const sag = this.state === FishingState.REELING ? 0.06 : 0.14;
      segments.push(...linePointsWithSag(tip, this.bobber.position, 12, sag));
      if (this.hookGroup.visible) {
        const hookPos = new THREE.Vector3();
        this.hookGroup.getWorldPosition(hookPos);
        segments.push(...linePointsWithSag(this.bobber.position, hookPos, 6, 0.04).slice(1));
      }
    } else if (this.hookGroup.visible) {
      const hookPos = new THREE.Vector3();
      this.hookGroup.getWorldPosition(hookPos);
      segments.push(...linePointsWithSag(tip, hookPos, 10, 0.08));
    } else {
      const end = tip.clone();
      end.y -= 0.18;
      segments.push(...linePointsWithSag(tip, end, 8, 0.05));
    }

    this.line.geometry.setFromPoints(segments);
  }

  showRigAtTip() {
    const tip = this.getRodTipWorld();
    this.hookGroup.position.copy(tip);
    this.hookGroup.position.y -= 0.04;
    this.hookGroup.visible = this.state === FishingState.IDLE;
    this.bobber.visible =
      this.state !== FishingState.IDLE &&
      this.state !== FishingState.CAUGHT &&
      this.state !== FishingState.FAILED &&
      this.state !== FishingState.CASTING;
  }

  startCast(power = 0.7, aimDir = null) {
    if (this.state !== FishingState.IDLE) return false;
    const s = getState();
    const zone = ZONES[s.zone];
    if (!zone) return false;

    const bait = getSelectedBait();
    this.castPower = Math.min(1, Math.max(0.2, power));
    this.state = FishingState.CASTING;
    this.castAnim = 0;
    this.hookGroup.visible = false;
    audio.playCast();

    let angle;
    const dist = zone.castRadius * this.castPower * 0.55 + zone.castRadius * 0.25;
    if (aimDir && aimDir.lengthSq() > 0.01) {
      this.castTarget.set(
        zone.castCenter.x + aimDir.x * dist,
        0,
        zone.castCenter.z + aimDir.z * dist
      );
    } else {
      angle = Math.random() * Math.PI * 2;
      this.castTarget.set(
        zone.castCenter.x + Math.cos(angle) * dist,
        0,
        zone.castCenter.z + Math.sin(angle) * dist
      );
    }

    return true;
  }

  finishCast() {
    const s = getState();
    const bait = getSelectedBait();
    this.bobber.position.copy(this.castTarget);
    this.bobber.position.y = 0.08;
    this.bobber.visible = true;
    this.hookGroup.position.copy(this.castTarget);
    this.hookGroup.position.y = 0.02;
    this.hookGroup.visible = true;
    audio.playSplash();
    this.state = FishingState.WAITING;
    this.preBiteWarned = false;
    const waitTime = Math.max(0.8, 1.5 + Math.random() * 4 - s.baitKit * 0.2 - bait.waitBonus);
    this.biteTimer = waitTime;
    this.onEvent?.("cast", { target: this.castTarget.clone(), bait });
  }

  update(dt, time) {
    if (this.state === FishingState.CASTING) {
      this.castAnim += dt * 2.5;
      if (this.castAnim >= 1) this.finishCast();
    }

    this.showRigAtTip();
    this.updateLine();

    if (this.bobber.visible && this.state !== FishingState.IDLE && this.state !== FishingState.CAUGHT) {
      const waterY = this.surfaceY(this.bobber.position.x, this.bobber.position.z, time);
      this.bobber.position.y = waterY + Math.sin(time * 3) * 0.015;

      if (this.state === FishingState.WAITING && this.biteTimer < 0.9 && !this.preBiteWarned) {
        this.preBiteWarned = true;
        this.onEvent?.("preBite", {});
      }
      if (this.state === FishingState.WAITING && this.preBiteWarned && this.biteTimer > 0) {
        this.bobber.position.y -= 0.04 + Math.sin(time * 16) * 0.025;
      }

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
        this.failReason = "missed";
        this.failCatch("Missed the hook — fish got away!");
      }
    }
  }

  triggerBite() {
    const s = getState();
    this.legendaryEvent = Math.random() < 0.04 && s.zone === "Deep Water";
    this.pendingFish = pickFish(s.zone, s.rodLevel, s.baitKit, s.selectedBait, this.legendaryEvent);
    this.state = FishingState.BITING;
    this.biteWindow = 2.5 + s.rodLevel * 0.2;
    this.biteWindowMax = this.biteWindow;
    this.spawnBiteFish();
    this.spawnSplash();
    audio.playBite();
    this.onEvent?.("bite", { species: this.pendingFish, legendary: this.legendaryEvent });
  }

  spawnBiteFish() {
    this.clearBiteFish();
    this.biteFish = buildBiteFish(this.pendingFish);
    if (this.legendaryEvent) {
      this.biteFish.scale.setScalar(1.35);
      this.biteFish.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material.emissiveIntensity = 0.45;
        }
      });
    }
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
    this.escapeTimer = 0;
    this.onEvent?.("hooked", { species: this.pendingFish, legendary: this.legendaryEvent });
    return true;
  }

  updateReelIdle(dt) {
    if (this.state !== FishingState.REELING) return;
    audio.stopReelLoop();
    const fight =
      (this.pendingFish?.rarity === "legendary" ? 0.07 : this.pendingFish?.rarity === "rare" ? 0.05 : 0.035) *
      dt *
      60;
    this.tension += fight * 0.4;
    this.tension = Math.min(1, this.tension);
    this.escapeTimer += dt;
    const escapeLimit = this.pendingFish?.rarity === "legendary" ? 3 : 4.5;
    if (this.escapeTimer >= escapeLimit) {
      this.failReason = "escape";
      this.failCatch("Fish got away — keep reeling!");
      return;
    }
    if (this.tension >= 0.95) {
      this.failReason = "snap";
      this.failCatch("Line snapped — ease up on the tension!");
      return;
    }
    this.onEvent?.("reeling", { tension: this.tension, progress: this.reelProgress });
  }

  reel(dt, intensity = 1) {
    if (this.state !== FishingState.REELING) return;
    audio.startReelLoop();
    audio.updateReelLoop(this.tension);
    this.escapeTimer = 0;
    const s = getState();
    const fishFight =
      (this.pendingFish?.rarity === "legendary" ? 0.09 : this.pendingFish?.rarity === "rare" ? 0.06 : 0.04) *
      dt *
      60;
    this.tension += intensity * 0.11 - fishFight;
    this.tension = Math.max(0, Math.min(1, this.tension));
    this.reelProgress += dt * (0.1 + s.rodLevel * 0.025) * intensity;

    if (this.tension >= 0.95) {
      this.failReason = "snap";
      this.failCatch("Line snapped — ease up on the tension!");
      return;
    }
    if (this.tension < 0.08 && this.reelProgress > 0.15) {
      this.failReason = "escape";
      this.failCatch("Fish shook the hook — keep reeling!");
      return;
    }
    if (this.reelProgress >= 1) this.completeCatch();
    this.onEvent?.("reeling", { tension: this.tension, progress: this.reelProgress });
  }

  stopReeling() {
    audio.stopReelLoop();
  }

  completeCatch() {
    if (!this.pendingFish || this.state === FishingState.CAUGHT) return;
    const s = getState();
    const bait = getSelectedBait();
    const weight = rollWeight(this.pendingFish);
    const catchData = formatCatch(this.pendingFish, weight, s.zone, s.rodLevel);
    catchData.baitUsed = bait.name;
    recordCatch(catchData);
    audio.stopReelLoop();
    if (catchData.rarity === "legendary") audio.playLegendaryCatch();
    else audio.playCatch();
    this.state = FishingState.CAUGHT;
    this.catchAnim = 0;
    this.bobber.visible = false;
    this.spawnSplash();
    this.spawnSplash();
    this.onEvent?.("caught", catchData);
  }

  failCatch(message) {
    if (this.state === FishingState.FAILED || this.state === FishingState.CAUGHT) return;
    audio.playFail(this.failReason);
    audio.stopReelLoop();
    this.state = FishingState.FAILED;
    this.resetTimer = 2;
    this.onEvent?.("failed", { message, reason: this.failReason });
    this.failReason = "default";
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
    this.castAnim = 0;
    this.preBiteWarned = false;
    this.escapeTimer = 0;
    this.legendaryEvent = false;
    this.bobber.rotation.z = 0;
    this.clearBiteFish();
    this.splashRings.forEach((ring) => {
      this.scene.remove(ring);
      ring.geometry?.dispose();
      ring.material?.dispose();
    });
    this.splashRings = [];
    audio.stopReelLoop();
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
        return `Ready — ${bait.name} on hook · aim and cast`;
      case FishingState.CASTING:
        return "Casting...";
      case FishingState.WAITING:
        return this.preBiteWarned
          ? `Something's near the ${bait.name}... get ready!`
          : `Waiting with ${bait.name}...`;
      case FishingState.BITING:
        return `BITE! ${this.pendingFish?.name || "Fish"} — hook now!`;
      case FishingState.REELING:
        return `Hooked! Hold reel — watch tension bar`;
      case FishingState.CAUGHT:
        return "Nice catch!";
      case FishingState.FAILED:
        return "Better luck next cast.";
      default:
        return "";
    }
  }
}
