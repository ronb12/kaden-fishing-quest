import * as THREE from "three";
import { ZONES, pickFish, rollWeight, formatCatch, getBait } from "./data.js";
import { getState, recordCatch, getSelectedBait } from "./state.js";
import * as audio from "./audio.js";
import { buildRealisticRod, buildBaitMesh, buildBobber, buildHook, buildBiteFish, buildSplashRing, buildFishingLine, updateFishingLineMesh, linePointsWithSag, buildDetailedFish, buildFishSilhouette, updateBaitAnimation, attachReelMechanism } from "./rod-model.js";
import {
  FishFightAI,
  FightPhase,
  nibbleCountForBait,
  tensionZone,
  TENSION,
} from "./fish-fight.js";
import {
  getRodStats,
  getSnapThreshold,
  getSweetZone,
  baitDepthMatch,
  isLurePresentation,
  isFloatPresentation,
} from "./gear-stats.js";

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
    this.desktopRodRotation = { x: -0.5, y: 0, z: -0.05 };
    this.rodBend = 0;
    this.castStartPos = new THREE.Vector3();
    this.vrWindupBend = 0;
    this.fightAI = new FishFightAI();
    this.nibbleThresholds = [];
    this.nibbleIndex = 0;
    this.nibbleDip = 0;
    this.prospectFish = null;
    this.prospectFishShadow = null;
    this.prospectAngle = 0;
    this.fishPull = new THREE.Vector2();
    this.lineShake = 0;
    this.castAccuracy = 0.5;
    this.castSplashDone = false;
    this.catchRigPos = new THREE.Vector3();
    this.catchSplashDone = false;
    this.fightPhaseLabel = "";
    this.lureActivity = 0;
    this.lureMotionDecay = 0;
    this.lastUpdateTime = 0;
    this.rebuildRod();
    scene.add(this.rodGroup);
    this.reelMechanism = null;
    this.reelCrank = null;
    this.reelSpool = null;
    this.reelKnob = null;
  }

  setupReelMechanism() {
    const rod = this.rodGroup.children[0];
    if (!rod) return;
    this.reelMechanism = attachReelMechanism(rod);
    this.reelSpool = this.reelMechanism.getObjectByName("reelSpool");
    this.reelCrank = this.reelMechanism.getObjectByName("reelCrank");
    this.reelKnob = this.reelMechanism.getObjectByName("reelKnob");
  }

  updateReelVisual(rotation) {
    if (!this.reelCrank || !this.reelSpool) return;
    this.reelCrank.rotation.x = rotation;
    this.reelSpool.rotation.x = rotation * 1.6;
  }

  getReelKnobWorld(target = new THREE.Vector3()) {
    if (this.reelKnob) this.reelKnob.getWorldPosition(target);
    else if (this.reelMechanism) this.reelMechanism.getWorldPosition(target);
    else this.rodGroup.getWorldPosition(target);
    return target;
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

    if (!this.prospectFishShadow) {
      this.prospectFishShadow = buildFishSilhouette();
      this.scene.add(this.prospectFishShadow);
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
    this.setupReelMechanism();
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

  updateRodTransform(controller, vrMotion = null, mode = "vr") {
    if (!controller) return;
    this.rodGroup.position.copy(controller.position);
    this.rodGroup.quaternion.copy(controller.quaternion);
    const rot = mode === "desktop" ? this.desktopRodRotation : this.baseRodRotation;
    const pitchAdjust = mode === "desktop" ? (controller.pitch ?? 0) * 0.4 : 0;
    const windupBend = vrMotion?.swingVisual ?? this.vrWindupBend ?? 0;
    const castPhase = this.state === FishingState.CASTING ? Math.sin(this.castAnim * Math.PI) : 0;
    const castSwing =
      this.state === FishingState.CASTING
        ? castPhase * (0.72 + this.castPower * 0.42)
        : windupBend * 0.38;
    const castTwist =
      this.state === FishingState.CASTING ? Math.sin(this.castAnim * Math.PI * 1.6) * 0.1 * this.castPower : 0;
    const fightBend = this.state === FishingState.REELING
      ? this.tension * 0.22 + Math.hypot(this.fishPull.x, this.fishPull.y) * 0.14
      : 0;
    const biteBend = this.state === FishingState.BITING ? 0.12 : 0;
    this.rodBend += ((fightBend + biteBend) - this.rodBend) * 0.12;
    this.rodGroup.rotateX(rot.x - castSwing + this.rodBend + pitchAdjust, true);
    this.rodGroup.rotateY(rot.y, true);
    this.rodGroup.rotateZ(rot.z + castTwist, true);
  }

  setVrWindup(amount) {
    this.vrWindupBend = amount;
  }

  /** Lure baits need rod motion to attract fish (Real VR Fishing lure fishing). */
  addLureMotion(amount = 0.1) {
    if (this.state !== FishingState.WAITING) return;
    const bait = getSelectedBait();
    if (!isLurePresentation(bait)) return;
    this.lureActivity = Math.min(1.2, this.lureActivity + amount);
    this.lureMotionDecay = 0.4;
  }

  updateLureActivity(dt) {
    if (this.state !== FishingState.WAITING) return;
    const bait = getSelectedBait();
    if (!isLurePresentation(bait)) return;
    this.lureMotionDecay = Math.max(0, this.lureMotionDecay - dt);
    if (this.lureMotionDecay <= 0) {
      const need = bait.lureActivityNeed ?? 0.45;
      this.lureActivity = Math.max(0.08, this.lureActivity - dt * (0.22 + need * 0.15));
    }
  }

  getLureActivityHint() {
    const bait = getSelectedBait();
    if (!isLurePresentation(bait) || this.state !== FishingState.WAITING) return null;
    const need = bait.lureActivityNeed ?? 0.45;
    const pct = Math.round(Math.min(1, this.lureActivity / need) * 100);
    if (pct < 40) return "Twitch the rod — lure needs action!";
    if (pct < 80) return "Keep working the lure...";
    return "Lure looks good — fish should notice";
  }

  surfaceY(x, z, time) {
    const wave = this.env.getWaterHeight(x, z, time);
    // Keep rigs above the visible water plane — raw wave sum can dip below y=0.
    return Math.max(0.12, 0.06 + wave);
  }

  updateLine() {
    const active =
      this.state !== FishingState.IDLE &&
      this.state !== FishingState.CAUGHT &&
      this.state !== FishingState.FAILED;
    if (this.line) this.line.visible = active;
    if (!active) return;

    const tip = this.getRodTipWorld();
    const segments = [];
    const fighting = this.state === FishingState.REELING;
    const taut = fighting && this.tension > 0.35;
    const baseSag = fighting ? 0.04 + (1 - this.tension) * 0.1 : 0.14;
    const shake = this.lineShake * (fighting ? 0.04 + this.tension * 0.06 : 0);

    if (this.bobber.visible) {
      const bobPos = this.bobber.position.clone();
      if (shake > 0) {
        bobPos.x += Math.sin(this.lineShake * 22) * shake;
        bobPos.z += Math.cos(this.lineShake * 19) * shake;
      }
      segments.push(...linePointsWithSag(tip, bobPos, taut ? 16 : 12, baseSag));
      if (this.hookGroup.visible) {
        const hookPos = new THREE.Vector3();
        this.hookGroup.getWorldPosition(hookPos);
        segments.push(...linePointsWithSag(bobPos, hookPos, 6, taut ? 0.015 : 0.04).slice(1));
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

    const casting = this.state === FishingState.CASTING;
    const lineRadius = fighting ? 0.012 : casting ? 0.011 : 0.01;
    updateFishingLineMesh(this.line, segments, lineRadius);
    if (this.line.material) {
      const rod = getRodStats(getState().rodLevel);
      const zone = tensionZone(this.tension, rod);
      if (zone === "snap" || zone === "warning") {
        this.line.material.color.setHex(0xff8866);
        this.line.material.emissive.setHex(0x662211);
        this.line.material.opacity = 0.98;
      } else if (zone === "sweet" && fighting) {
        this.line.material.color.setHex(0x6ac8a0);
        this.line.material.emissive.setHex(0x1a4030);
        this.line.material.opacity = 0.96;
      } else {
        this.line.material.color.setHex(0xc8e8e0);
        this.line.material.emissive.setHex(0x2a5048);
        this.line.material.opacity = taut ? 0.98 : 0.94;
      }
    }
  }

  showRigAtTip() {
    const bait = getSelectedBait();
    const usesBobber = isFloatPresentation(bait);
    const active =
      this.state !== FishingState.IDLE &&
      this.state !== FishingState.CAUGHT &&
      this.state !== FishingState.FAILED;

    if (this.state === FishingState.IDLE) {
      const tip = this.getRodTipWorld();
      this.hookGroup.position.copy(tip);
      this.hookGroup.position.y -= 0.04;
      this.hookGroup.visible = true;
      this.bobber.visible = false;
      return;
    }

    this.bobber.visible = active && usesBobber;
    this.hookGroup.visible = active;
  }

  updateCastFlight(time) {
    const t = Math.min(1, this.castAnim);
    const start = this.castStartPos;
    const end = this.castTarget;
    const bait = getSelectedBait();
    const usesBobber = isFloatPresentation(bait);
    const endSurface = this.surfaceY(end.x, end.z, time);
    const endY = endSurface + (usesBobber ? 0.04 : -0.02);
    const arc = 0.85 + this.castPower * 2.8;
    const midX = (start.x + end.x) * 0.5;
    const midZ = (start.z + end.z) * 0.5;
    const midY = Math.max(start.y, endY) + arc;
    const u = 1 - t;
    const flyX = u * u * start.x + 2 * u * t * midX + t * t * end.x;
    const flyY = u * u * start.y + 2 * u * t * midY + t * t * endY;
    const flyZ = u * u * start.z + 2 * u * t * midZ + t * t * end.z;
    this.hookGroup.position.set(flyX, flyY - 0.05, flyZ);
    this.hookGroup.visible = true;
    if (usesBobber) {
      this.bobber.position.set(flyX, flyY + 0.03, flyZ);
      this.bobber.visible = true;
    } else {
      this.bobber.visible = false;
    }
    if (t > 0.82 && !this.castSplashDone) {
      this.castSplashDone = true;
      this.spawnSplashAt(flyX, endSurface, flyZ);
    }
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
    this.castSplashDone = false;
    this.castStartPos.copy(this.getRodTipWorld());
    this.hookGroup.visible = false;
    this.bobber.visible = false;
    audio.playCast();

    const dist = zone.castRadius * this.castPower * 0.55 + zone.castRadius * 0.25;
    const rod = getRodStats(s.rodLevel);
    const scaledDist = dist * rod.castMult;
    if (aimDir && aimDir.lengthSq() > 0.01) {
      this.castTarget.set(
        zone.castCenter.x + aimDir.x * scaledDist,
        0,
        zone.castCenter.z + aimDir.z * scaledDist
      );
    } else {
      const angle = Math.random() * Math.PI * 2;
      this.castTarget.set(
        zone.castCenter.x + Math.cos(angle) * scaledDist,
        0,
        zone.castCenter.z + Math.sin(angle) * scaledDist
      );
    }

    const castDx = this.castTarget.x - zone.castCenter.x;
    const castDz = this.castTarget.z - zone.castCenter.z;
    const castDist = Math.hypot(castDx, castDz);
    this.castAccuracy = Math.max(0, 1 - castDist / (zone.castRadius * 0.95));

    return true;
  }

  finishCast() {
    const s = getState();
    const bait = getSelectedBait();
    const zone = ZONES[s.zone];
    const depthMatch = baitDepthMatch(bait, zone?.depth ?? 0.3);
    const surface = this.surfaceY(this.castTarget.x, this.castTarget.z, 0);
    const usesBobber = isFloatPresentation(bait);
    this.bobber.position.copy(this.castTarget);
    this.bobber.position.y = surface + 0.05;
    this.bobber.visible = usesBobber;
    this.hookGroup.position.copy(this.castTarget);
    const sink = bait.sinkSpeed ?? 0.2;
    this.hookGroup.position.y = surface - 0.02 - sink * 0.06;
    this.hookGroup.visible = true;
    this.spawnSplashAt(this.castTarget.x, surface, this.castTarget.z);
    audio.playSplash();
    this.state = FishingState.WAITING;
    this.preBiteWarned = false;
    this.nibbleIndex = 0;
    this.nibbleDip = 0;
    this.lureActivity = isLurePresentation(bait) ? 0.15 : 1;
    this.lureMotionDecay = 0;
    const waitTime = Math.max(
      0.7,
      (1.8 + Math.random() * 4 - s.baitKit * 0.2 - bait.waitBonus) *
        (1.1 - this.castAccuracy * 0.35) *
        (2.1 - depthMatch * 0.55) *
        (isLurePresentation(bait) ? 0.75 : 1)
    );
    this.biteTimer = waitTime;
    const nibbleTotal = nibbleCountForBait(bait);
    this.nibbleThresholds = [];
    for (let i = 0; i < nibbleTotal; i++) {
      this.nibbleThresholds.push(waitTime * (0.2 + ((i + 1) / (nibbleTotal + 1)) * 0.65));
    }
    this.spawnProspectFish();
    this.onEvent?.("cast", { target: this.castTarget.clone(), bait, accuracy: this.castAccuracy });
  }

  update(dt, time) {
    this.lastUpdateTime = time;
    if (this.state === FishingState.CASTING) {
      this.castAnim += dt * (2.2 + this.castPower * 1.4);
      this.updateCastFlight(time);
      if (this.castAnim >= 1) this.finishCast();
    }

    this.showRigAtTip();
    this.updateLine();
    if (this.baitMesh) updateBaitAnimation(this.baitMesh, time);

    if (
      this.bobber.visible &&
      this.state !== FishingState.IDLE &&
      this.state !== FishingState.CAUGHT &&
      this.state !== FishingState.CASTING
    ) {
      const waterY = this.surfaceY(this.bobber.position.x, this.bobber.position.z, time);
      let bobY = waterY + Math.sin(time * 3) * 0.015;

      if (this.nibbleDip > 0) {
        this.nibbleDip = Math.max(0, this.nibbleDip - dt * 3.5);
        bobY -= 0.05 + this.nibbleDip * 0.08;
      }

      if (this.state === FishingState.WAITING && this.preBiteWarned && this.biteTimer > 0) {
        bobY -= 0.04 + Math.sin(time * 16) * 0.025;
      }

      if (this.state === FishingState.REELING) {
        bobY += this.fishPull.x * 0.08 + Math.sin(time * 11) * 0.03 * this.tension;
        this.bobber.position.x += this.fishPull.x * dt * 0.35;
        this.bobber.position.z += this.fishPull.y * dt * 0.35;
      }

      this.bobber.position.y = bobY;

      if (this.state === FishingState.BITING) {
        this.bobber.position.y += Math.sin(time * 12) * 0.05;
        this.bobber.rotation.z = Math.sin(time * 14) * 0.18;
        this.updateBiteFish(dt, time);
      }

      if (this.state === FishingState.REELING) {
        this.updateFightFish(dt, time);
        this.lineShake += dt * (1.5 + this.tension * 4);
      } else {
        this.lineShake *= 0.9;
      }

      this.hookGroup.position.copy(this.bobber.position);
      const sink = getSelectedBait()?.sinkSpeed ?? 0.2;
      this.hookGroup.position.y -= 0.04 + sink * 0.06;
    } else if (
      this.hookGroup.visible &&
      this.state !== FishingState.IDLE &&
      this.state !== FishingState.CAUGHT &&
      this.state !== FishingState.CASTING
    ) {
      const bait = getSelectedBait();
      const sink = bait?.sinkSpeed ?? 0.3;
      const waterY = this.surfaceY(this.hookGroup.position.x, this.hookGroup.position.z, time);
      let hookY = waterY - sink * 0.1 + Math.sin(time * 3.2) * 0.012;

      if (this.state === FishingState.REELING) {
        hookY += this.fishPull.x * 0.06 + Math.sin(time * 11) * 0.025 * this.tension;
        this.hookGroup.position.x += this.fishPull.x * dt * 0.35;
        this.hookGroup.position.z += this.fishPull.y * dt * 0.35;
        this.updateFightFish(dt, time);
        this.lineShake += dt * (1.5 + this.tension * 4);
      } else if (this.state === FishingState.BITING) {
        hookY += Math.sin(time * 12) * 0.04;
        this.updateBiteFish(dt, time);
        this.lineShake *= 0.9;
      } else {
        this.lineShake *= 0.9;
      }

      this.hookGroup.position.y = hookY;
    } else {
      this.lineShake *= 0.9;
    }

    if (this.state === FishingState.WAITING) {
      this.updateProspectFish(dt, time);
      this.updateLureActivity(dt);
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
      this.biteTimer -= dt * (isLurePresentation(getSelectedBait()) ? Math.max(0.25, this.lureActivity) : 1);
      while (
        this.nibbleIndex < this.nibbleThresholds.length &&
        this.biteTimer <= this.nibbleThresholds[this.nibbleIndex]
      ) {
        this.triggerNibble();
        this.nibbleIndex += 1;
      }
      if (this.biteTimer <= 0.9 && !this.preBiteWarned) {
        this.preBiteWarned = true;
        this.onEvent?.("preBite", {});
      }
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

  triggerNibble() {
    this.nibbleDip = 1;
    audio.playNibble();
    this.onEvent?.("nibble", { index: this.nibbleIndex });
    if (this.prospectFish) {
      this.prospectAngle += 0.8;
    }
  }

  spawnProspectFish() {
    this.clearProspectFish();
    const s = getState();
    const preview = pickFish(s.zone, s.rodLevel, s.baitKit, s.selectedBait, false);
    this.prospectFish = buildDetailedFish(preview, 1.05);
    this.prospectFish.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.78;
        c.material.depthWrite = false;
        c.material.emissive = new THREE.Color(preview?.color ?? 0x2a6080);
        c.material.emissiveIntensity = 0.85;
      }
    });
    this.prospectFish.renderOrder = 6;
    this.prospectFish.frustumCulled = false;
    this.prospectAngle = Math.random() * Math.PI * 2;
    this.scene.add(this.prospectFish);
    if (this.prospectFishShadow) {
      this.prospectFishShadow.visible = true;
      this.prospectFishShadow.scale.setScalar(0.85);
    }
  }

  updateProspectFish(dt, time) {
    if (!this.prospectFish) return;
    this.prospectAngle += dt * (0.6 + this.nibbleIndex * 0.15);
    const bx = this.bobber.visible ? this.bobber.position.x : this.hookGroup.position.x;
    const bz = this.bobber.visible ? this.bobber.position.z : this.hookGroup.position.z;
    const surface = this.surfaceY(bx, bz, time);
    const radius = 1.15 - this.nibbleIndex * 0.12 + Math.sin(time * 0.7) * 0.15;
    const fx = bx + Math.cos(this.prospectAngle) * radius;
    const fz = bz + Math.sin(this.prospectAngle) * radius;
    const swimDepth = 0.24 + this.nibbleIndex * 0.02;
    const fishY = surface - swimDepth + Math.sin(time * 1.8) * 0.025;
    this.prospectFish.position.set(fx, fishY, fz);
    this.prospectFish.lookAt(bx, surface - swimDepth - 0.06, bz);
    this.prospectFish.rotation.z = Math.sin(time * 2.4) * 0.08;
    if (this.prospectFishShadow) {
      this.prospectFishShadow.position.set(fx, surface + 0.015, fz);
      const pulse = 0.95 + Math.sin(time * 2.2 + this.nibbleIndex) * 0.14;
      this.prospectFishShadow.scale.setScalar(0.9 * pulse);
      this.prospectFishShadow.material.opacity = 0.42 + this.nibbleIndex * 0.1;
    }
  }

  clearProspectFish() {
    if (!this.prospectFish) {
      if (this.prospectFishShadow) this.prospectFishShadow.visible = false;
      return;
    }
    this.scene.remove(this.prospectFish);
    this.prospectFish.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    this.prospectFish = null;
    if (this.prospectFishShadow) this.prospectFishShadow.visible = false;
  }

  triggerBite() {
    const s = getState();
    this.clearProspectFish();
    this.legendaryEvent = Math.random() < 0.04 && s.zone === "Deep Water";
    this.pendingFish = pickFish(s.zone, s.rodLevel, s.baitKit, s.selectedBait, this.legendaryEvent);
    this.state = FishingState.BITING;
    this.biteWindow = 2.5 + s.rodLevel * 0.2 + getRodStats(s.rodLevel).hookBonus;
    this.biteWindowMax = this.biteWindow;
    this.spawnBiteFish();
    this.spawnSplash();
    audio.playBite();
    this.onEvent?.("bite", { species: this.pendingFish, legendary: this.legendaryEvent });
  }

  spawnBiteFish() {
    this.clearBiteFish();
    this.biteFish = buildBiteFish(this.pendingFish);
    this.biteFish.scale.setScalar(this.legendaryEvent ? 1.65 : 1.45);
    const pos = this.bobber.visible ? this.bobber.position : this.hookGroup.position;
    const surface = this.surfaceY(pos.x, pos.z, 0);
    this.biteFish.position.set(pos.x + 0.28, surface + 0.18, pos.z + 0.2);
    this.biteFish.lookAt(pos.x, surface + 0.08, pos.z);
    this.biteFish.renderOrder = 10;
    this.biteFish.frustumCulled = false;
    this.biteLunge = 0;
    this.scene.add(this.biteFish);
  }

  updateBiteFish(dt, time) {
    if (!this.biteFish) return;
    const rig = this.bobber.visible ? this.bobber.position : this.hookGroup.position;
    const bx = rig.x;
    const bz = rig.z;
    const surface = this.surfaceY(bx, bz, time);
    const target = new THREE.Vector3(bx + 0.06, surface + 0.2, bz + 0.04);
    this.biteLunge = Math.min(1, this.biteLunge + dt * 2.2);
    const start = new THREE.Vector3(bx + 0.32, surface + 0.22, bz + 0.22);
    this.biteFish.position.lerpVectors(start, target, this.biteLunge);
    this.biteFish.lookAt(bx, surface + 0.1, bz);
    this.biteFish.rotation.z = Math.sin(this.biteLunge * 22) * 0.18;
    if (this.biteLunge > 0.55 && Math.random() < dt * 2) this.spawnSplash();
  }

  updateFightFish(dt, time) {
    if (!this.biteFish) return;
    const rig = this.bobber.visible ? this.bobber.position : this.hookGroup.position;
    const bx = rig.x;
    const bz = rig.z;
    const surface = this.surfaceY(bx, bz, time);
    const pullX = this.fishPull.x * 0.45;
    const pullZ = this.fishPull.y * 0.45;
    const target = new THREE.Vector3(
      bx - 0.12 + pullX,
      surface + 0.12 + this.reelProgress * 0.55 + Math.sin(time * 9) * 0.14,
      bz - 0.08 + pullZ
    );
    this.biteFish.position.lerp(target, dt * 4);
    this.biteFish.lookAt(bx, surface + 0.12, bz);
    this.biteFish.rotation.z = Math.sin(time * 11) * 0.35 * (0.5 + this.tension);
    if (this.biteFish.position.y > surface && Math.random() < dt * 3) {
      this.spawnSplash();
    }
  }

  updateCatchAnim(dt, time) {
    if (!this.biteFish && this.pendingFish) {
      this.biteFish = buildBiteFish(this.pendingFish);
      this.biteFish.scale.setScalar(this.legendaryEvent ? 1.85 : 1.65);
      this.biteFish.position.copy(this.catchRigPos);
      this.biteFish.renderOrder = 12;
      this.scene.add(this.biteFish);
    }
    if (!this.biteFish) return;
    this.catchAnim += dt;
    const t = this.catchAnim;
    const bx = this.catchRigPos.x;
    const bz = this.catchRigPos.z;
    const surface = this.surfaceY(bx, bz, time);
    const jump = Math.sin(Math.min(1, t * 0.75) * Math.PI) * 1.55;
    const sway = Math.sin(t * 4) * 0.22;
    this.biteFish.position.set(bx + sway, surface + 0.18 + jump, bz + Math.cos(t * 3) * 0.18);
    this.biteFish.rotation.y += dt * 3.8;
    this.biteFish.rotation.z = Math.sin(t * 10) * 0.5;
    if (t > 0.15 && t < 0.45 && !this.catchSplashDone) {
      this.catchSplashDone = true;
      this.spawnSplashAt(bx, surface, bz);
    }
  }

  spawnSplashAt(x, surfaceY, z) {
    const prev = this.bobber.position.clone();
    this.bobber.position.set(x, surfaceY + 0.04, z);
    this.spawnSplash();
    this.bobber.position.copy(prev);
  }

  spawnSplash() {
    for (let i = 0; i < 3; i++) {
      const ring = buildSplashRing();
      ring.position.copy(this.bobber.position);
      ring.position.y = this.bobber.position.y;
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
    this.tension = 0.28;
    this.reelProgress = 0;
    this.escapeTimer = 0;
    this.fishPull.set(0, 0);
    this.fightAI.reset(this.pendingFish);
    this.fightPhaseLabel = this.fightAI.getPhaseLabel();
    audio.playHook();
    this.onEvent?.("hooked", { species: this.pendingFish, legendary: this.legendaryEvent });
    return true;
  }

  applyFightStep(dt, isReeling, reelIntensity = 1) {
    const rod = getRodStats(getState().rodLevel);
    const fight = this.fightAI.update(dt, isReeling, reelIntensity);
    this.tension += fight.tensionDelta * (1 - rod.fightControl);
    this.tension = Math.max(0, Math.min(1, this.tension));
    this.fishPull.x += (fight.pullX - this.fishPull.x) * Math.min(1, dt * 5);
    this.fishPull.y += (fight.pullZ - this.fishPull.y) * Math.min(1, dt * 5);
    this.fightPhaseLabel = this.fightAI.getPhaseLabel();
    return fight;
  }

  applyReelProgress(dt, intensity, reelMult = 1) {
    const s = getState();
    const rod = getRodStats(s.rodLevel);
    const zone = tensionZone(this.tension, rod);
    let rate = (0.09 + s.rodLevel * 0.022) * rod.reelMult;

    if (zone === "sweet") rate *= 1.35 * reelMult;
    else if (zone === "high") rate *= 0.55 * reelMult;
    else if (zone === "loose") rate *= 0.35;
    else if (zone === "warning") rate *= 0.2;
    else rate *= 0.05;

    if (this.fightAI.phase === FightPhase.THRASH) rate *= 0.08;

    this.reelProgress += dt * rate * intensity;
  }

  getSnapLimit() {
    return getSnapThreshold(getState().rodLevel);
  }

  updateReelIdle(dt) {
    if (this.state !== FishingState.REELING) return;
    audio.stopReelLoop();
    const fight = this.applyFightStep(dt, false, 0);
    this.escapeTimer += dt;
    const escapeLimit = this.pendingFish?.rarity === "legendary" ? 3.5 : 5;
    if (this.escapeTimer >= escapeLimit) {
      this.failReason = "escape";
      this.failCatch("Fish got away — reel when it tires!");
      return;
    }
    if (this.tension >= this.getSnapLimit()) {
      this.failReason = "snap";
      this.failCatch("Line snapped — ease up on the tension!");
      return;
    }
    this.onEvent?.("reeling", {
      tension: this.tension,
      progress: this.reelProgress,
      phase: fight.phase,
      phaseLabel: this.fightPhaseLabel,
      fishPull: fight.pullIntensity,
    });
  }

  reel(dt, intensity = 1) {
    if (this.state !== FishingState.REELING) return;
    audio.startReelLoop();
    audio.updateReelLoop(this.tension);
    this.escapeTimer = 0;
    const fight = this.applyFightStep(dt, true, intensity);

    if (this.tension > TENSION.WARNING && intensity > 0.15) {
      const rod = getRodStats(getState().rodLevel);
      this.tension += dt * (1.8 + intensity * 2.2) * (1.1 - rod.lineStrength * 0.15);
    }

    this.applyReelProgress(dt, intensity, fight.reelMult);
    this.tension = Math.max(0, Math.min(1, this.tension));

    if (this.tension >= this.getSnapLimit()) {
      this.failReason = "snap";
      this.failCatch("Line snapped — ease up on the tension!");
      return;
    }
    if (this.tension < TENSION.LOOSE && this.reelProgress > 0.12 && fight.phase !== FightPhase.TIRED) {
      this.failReason = "escape";
      this.failCatch("Fish shook the hook — wait for a tired moment!");
      return;
    }
    if (this.reelProgress >= 1) this.completeCatch();
    this.onEvent?.("reeling", {
      tension: this.tension,
      progress: this.reelProgress,
      phase: fight.phase,
      phaseLabel: this.fightPhaseLabel,
      fishPull: fight.pullIntensity,
      phaseChanged: fight.phaseChanged,
    });
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
    this.catchSplashDone = false;
    const rig = this.bobber.visible ? this.bobber.position : this.hookGroup.position;
    this.catchRigPos.copy(rig);
    this.bobber.visible = false;
    if (this.biteFish) {
      this.biteFish.scale.setScalar(catchData.rarity === "legendary" ? 1.9 : 1.7);
      this.biteFish.traverse((c) => {
        if (c.isMesh && c.material?.emissiveIntensity != null) {
          c.material.emissiveIntensity = 0.75;
        }
      });
    }
    const splashY = this.surfaceY(rig.x, rig.z, 0);
    this.spawnSplashAt(rig.x, splashY, rig.z);
    this.spawnSplashAt(rig.x, splashY, rig.z);
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
    this.castSplashDone = false;
    this.catchSplashDone = false;
    this.preBiteWarned = false;
    this.escapeTimer = 0;
    this.legendaryEvent = false;
    this.nibbleThresholds = [];
    this.nibbleIndex = 0;
    this.nibbleDip = 0;
    this.fishPull.set(0, 0);
    this.lineShake = 0;
    this.fightPhaseLabel = "";
    this.lureActivity = 0;
    this.lureMotionDecay = 0;
    this.clearProspectFish();
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

  getStatusText(vr = false) {
    const bait = getSelectedBait();
    switch (this.state) {
      case FishingState.IDLE:
        return vr
          ? `Pull rod back, then swing forward to cast · ${bait.name} on hook`
          : `Ready — ${bait.name} on hook · aim and cast`;
      case FishingState.CASTING:
        return "Line flying...";
      case FishingState.WAITING: {
        const lureHint = this.getLureActivityHint();
        if (lureHint) return lureHint;
        return this.nibbleDip > 0.5
          ? "Nibble! Fish is tasting the bait..."
          : this.preBiteWarned
            ? `Something big near the ${bait.name}... set the hook!`
            : `Waiting with ${bait.name}... watch for nibbles`;
      }
      case FishingState.BITING:
        return vr
          ? `STRIKE! Jerk rod up or pull trigger — hook now!`
          : `STRIKE! ${this.pendingFish?.name || "Fish"} — hook now!`;
      case FishingState.REELING:
        return vr
          ? this.fightPhaseLabel || "Crank left hand on the reel when the fish tires"
          : this.fightPhaseLabel || "Reel in the sweet zone — ease off on runs";
      case FishingState.CAUGHT:
        return "Nice catch!";
      case FishingState.FAILED:
        return "Better luck next cast.";
      default:
        return "";
    }
  }
}
