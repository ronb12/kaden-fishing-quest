import * as THREE from "three";

const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _headFwd = new THREE.Vector3();
const _headUp = new THREE.Vector3(0, 1, 0);
const _swing = new THREE.Vector3();
const _rodFwd = new THREE.Vector3();
const _reelAxis = new THREE.Vector3();
const _handle = new THREE.Vector3();
const _proj = new THREE.Vector3();

/**
 * Tracks physical VR controller motion for cast swings and reel cranks.
 */
export class VRFishingMotion {
  constructor() {
    this.windup = 0;
    this.swingVisual = 0;
    this.castCooldown = 0;
    this.sampled = false;
    this.prevPos = new THREE.Vector3();
    this.reelPrevPhase = null;
    this.reelCrankIntensity = 0;
    this.hookJerkCooldown = 0;
    this.reelHapticCooldown = 0;
  }

  resetCast() {
    this.windup = 0;
    this.swingVisual = 0;
  }

  pulseHaptic(controller, intensity = 0.45, duration = 35) {
    const actuator = controller?.gamepad?.hapticActuators?.[0];
    if (actuator?.pulse) {
      actuator.pulse(intensity, duration).catch(() => {});
      return;
    }
    const vib = controller?.gamepad?.vibrationActuator;
    if (vib?.playEffect) {
      vib.playEffect("dual-rumble", {
        duration,
        strongMagnitude: intensity,
        weakMagnitude: intensity * 0.6,
      }).catch(() => {});
    }
  }

  update(controller, head, rodGroup, dt, fishingState) {
    if (!controller) {
      return { castRelease: null, reelIntensity: 0, hookSet: false, windup: 0, swingVisual: 0 };
    }

    this.castCooldown = Math.max(0, this.castCooldown - dt);
    this.hookJerkCooldown = Math.max(0, this.hookJerkCooldown - dt);

    controller.getWorldPosition(_pos);
    if (!this.sampled) {
      this.prevPos.copy(_pos);
      this.sampled = true;
      return { castRelease: null, reelIntensity: 0, hookSet: false, windup: this.windup, swingVisual: this.swingVisual };
    }

    _vel.subVectors(_pos, this.prevPos).divideScalar(Math.max(dt, 0.001));
    this.prevPos.copy(_pos);

    head.getWorldDirection(_headFwd);
    _headFwd.y = 0;
    if (_headFwd.lengthSq() < 0.0001) _headFwd.set(0, 0, -1);
    _headFwd.normalize();

    const speed = _vel.length();
    const backPull = -_vel.dot(_headFwd);
    const forwardSwing = _vel.dot(_headFwd);
    const upSwing = _vel.y;
    const headHeight = head.position.y;

    let castRelease = null;
    let hookSet = false;
    let reelIntensity = 0;

    if (fishingState === "idle") {
      const pullingBack = backPull > 0.28 || (_pos.y - headHeight > 0.28 && backPull > 0.05);
      if (pullingBack) {
        this.windup = Math.min(1, this.windup + (backPull * 0.55 + Math.max(0, upSwing) * 0.25) * dt * 2.4);
        this.swingVisual = Math.min(1, this.swingVisual + dt * 3.5);
      }

      if (
        this.castCooldown <= 0 &&
        this.windup >= 0.15 &&
        forwardSwing > 0.95 &&
        speed > 1.15
      ) {
        const power = Math.min(1, Math.max(0.25, this.windup * 0.48 + forwardSwing * 0.18 + speed * 0.07));
        _swing.copy(_vel);
        _swing.y = Math.max(-0.15, _swing.y * 0.25);
        if (_swing.lengthSq() < 0.02) _swing.copy(_headFwd);
        else _swing.normalize();

        castRelease = { power, aimDir: _swing.clone() };
        this.windup = 0;
        this.swingVisual = 0;
        this.castCooldown = 1.1;
        this.pulseHaptic(controller, 0.65, 55);
      } else if (!pullingBack && forwardSwing < 0.35) {
        this.windup = Math.max(0, this.windup - dt * 0.7);
        this.swingVisual = Math.max(0, this.swingVisual - dt * 2.5);
      }
    }

    if (fishingState === "biting") {
      const jerk = upSwing > 1.05 && speed > 0.95;
      if (jerk && this.hookJerkCooldown <= 0) {
        hookSet = true;
        this.hookJerkCooldown = 0.45;
        this.pulseHaptic(controller, 0.8, 70);
      }
    }

    if (fishingState === "reeling" && rodGroup) {
      rodGroup.getWorldDirection(_rodFwd);
      _reelAxis.crossVectors(_rodFwd, _headUp);
      if (_reelAxis.lengthSq() < 0.01) _reelAxis.set(1, 0, 0);
      else _reelAxis.normalize();

      _handle.set(0, 1, 0).applyQuaternion(controller.quaternion);
      _proj.copy(_handle).projectOnPlane(_rodFwd);
      if (_proj.lengthSq() > 0.01) {
        _proj.normalize();
        const phase = Math.atan2(_proj.dot(_reelAxis), _proj.dot(_headUp));
        if (this.reelPrevPhase !== null) {
          let delta = phase - this.reelPrevPhase;
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          reelIntensity = Math.min(1.5, Math.abs(delta) / (Math.PI / 8));
        }
        this.reelPrevPhase = phase;
      }

      const pullIn = -_vel.dot(_rodFwd);
      if (pullIn > 0.25) reelIntensity = Math.min(1.5, reelIntensity + pullIn * 0.4);

      const crankSpeed = reelIntensity;
      this.reelCrankIntensity += (crankSpeed - this.reelCrankIntensity) * Math.min(1, dt * 14);
      this.reelHapticCooldown = Math.max(0, this.reelHapticCooldown - dt);
      if (crankSpeed > 0.12 && this.reelHapticCooldown <= 0) {
        this.pulseHaptic(controller, 0.12 + crankSpeed * 0.08, 18);
        this.reelHapticCooldown = 0.09;
      }
    } else {
      this.reelPrevPhase = null;
      this.reelCrankIntensity = Math.max(0, this.reelCrankIntensity - dt * 4);
    }

    return {
      castRelease,
      reelIntensity: this.reelCrankIntensity,
      hookSet,
      windup: this.windup,
      swingVisual: this.swingVisual,
    };
  }
}
