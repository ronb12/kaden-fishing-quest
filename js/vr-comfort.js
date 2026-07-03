import * as THREE from "three";

/**
 * VR comfort: snap turn on thumbstick, optional teleport arcs.
 */
export class VRComfort {
  constructor(rig, getSettings) {
    this.rig = rig;
    this.getSettings = getSettings;
    this.yawOffset = 0;
    this.snapCooldown = 0;
    this.teleportCooldown = 0;
    this.lastStickX = 0;
  }

  reset() {
    this.yawOffset = 0;
    this.snapCooldown = 0;
    this.lastStickX = 0;
    if (this.rig) this.rig.rotation.y = 0;
  }

  applyBaseRotation() {
    if (this.rig) this.rig.rotation.y = this.yawOffset;
  }

  update(dt, leftController, rightController) {
    const settings = this.getSettings?.() || {};
    if (settings.vrSnapTurn === false) return;

    this.snapCooldown = Math.max(0, this.snapCooldown - dt);
    const pad = leftController?.gamepad || rightController?.gamepad;
    const axes = pad?.axes;
    if (!axes || axes.length < 2) return;

    const stickX = Math.abs(axes[2] ?? axes[0] ?? 0) > Math.abs(axes[3] ?? axes[1] ?? 0)
      ? (axes[2] ?? axes[0] ?? 0)
      : 0;

    const threshold = 0.72;
    const angleDeg = settings.vrSnapAngle || 45;
    const angleRad = (angleDeg * Math.PI) / 180;

    if (this.snapCooldown <= 0) {
      if (stickX > threshold && this.lastStickX <= threshold) {
        this.yawOffset -= angleRad;
        this.snapCooldown = 0.35;
      } else if (stickX < -threshold && this.lastStickX >= -threshold) {
        this.yawOffset += angleRad;
        this.snapCooldown = 0.35;
      }
    }
    this.lastStickX = stickX;
    this.applyBaseRotation();
  }

  tick(dt) {
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
  }
}
