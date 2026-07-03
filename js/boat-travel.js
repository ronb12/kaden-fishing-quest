import * as THREE from "three";

/**
 * Short skiff voyage: fade + camera lerp between zone teleports.
 */
export function startBoatVoyage({ from, to, player, camera, overlayEl, duration = 2.8, onMidpoint, onComplete }) {
  return new Promise((resolve) => {
    const start = new THREE.Vector3(from.x, from.y ?? 1.6, from.z);
    const end = new THREE.Vector3(to.x, to.y ?? 1.6, to.z);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 0.35;
    let t = 0;
    overlayEl?.classList.add("visible");

    const tick = () => {
      t += 1 / 60;
      const p = Math.min(1, t / duration);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const eye = new THREE.Vector3();
      if (p < 0.5) {
        eye.lerpVectors(start, mid, ease * 2);
      } else {
        if (p >= 0.5 && onMidpoint) onMidpoint();
        const local = (p - 0.5) * 2;
        eye.lerpVectors(mid, end, local);
      }
      if (player) {
        player.position.x = eye.x;
        player.position.z = eye.z;
      }
      if (camera) {
        camera.position.y = Math.max(0.92, eye.y - (player?.position.y ?? 0));
      }
      if (p < 1) requestAnimationFrame(tick);
      else {
        overlayEl?.classList.remove("visible");
        onComplete?.();
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

export function getBoatTravelDuration(boatLevel) {
  if (boatLevel >= 3) return 1.8;
  if (boatLevel >= 2) return 2.8;
  return 3.4;
}
