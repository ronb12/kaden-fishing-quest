import * as THREE from "three";

const _fwd = new THREE.Vector3();

/**
 * VR comfort: snap turn on thumbstick, optional teleport arcs.
 */
export class VRComfort {
  constructor(camera, getSettings) {
    this.camera = camera;
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
  }

  applyBaseRotation() {
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yawOffset;
    this.camera.rotation.x = 0;
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

  /** Teleport player rig to a world position (XZ), keeping head height. */
  teleportTo(position, rig) {
    if (!rig || this.teleportCooldown > 0) return false;
    const dy = this.camera.position.y - rig.position.y;
    rig.position.x = position.x;
    rig.position.z = position.z;
    this.camera.position.x = position.x;
    this.camera.position.z = position.z;
    this.camera.position.y = rig.position.y + dy;
    this.teleportCooldown = 0.5;
    return true;
  }

  tick(dt) {
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
  }
}
