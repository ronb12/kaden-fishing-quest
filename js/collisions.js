import * as THREE from "three";

const _tmp = new THREE.Vector3();

/** 2D collision volumes for blocking player movement on the XZ plane. */
export class CollisionSystem {
  constructor() {
    /** @type {{ x: number, z: number, r: number }[]} */
    this.circles = [];
    /** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }[]} */
    this.boxes = [];
  }

  addCircle(x, z, radius) {
    if (radius > 0) this.circles.push({ x, z, r: radius });
    return this;
  }

  addBox(minX, maxX, minZ, maxZ) {
    if (maxX > minX && maxZ > minZ) {
      this.boxes.push({ minX, maxX, minZ, maxZ });
    }
    return this;
  }

  /** Axis-aligned box from center, half-extents on X/Z. */
  addBoxCenter(cx, cz, halfX, halfZ) {
    return this.addBox(cx - halfX, cx + halfX, cz - halfZ, cz + halfZ);
  }

  resolve(position, playerRadius = 0.42) {
    const p = position.clone();
    for (let pass = 0; pass < 4; pass++) {
      for (const box of this.boxes) {
        this.pushOutOfBox(p, box, playerRadius);
      }
      for (const circle of this.circles) {
        this.pushOutOfCircle(p, circle.x, circle.z, circle.r + playerRadius);
      }
    }
    return p;
  }

  pushOutOfCircle(p, cx, cz, radius) {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius || distSq < 1e-8) return;
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    p.x += (dx / dist) * push;
    p.z += (dz / dist) * push;
  }

  pushOutOfBox(p, box, radius) {
    const insideX = p.x > box.minX && p.x < box.maxX;
    const insideZ = p.z > box.minZ && p.z < box.maxZ;

    if (insideX && insideZ) {
      const overlapLeft = p.x - box.minX;
      const overlapRight = box.maxX - p.x;
      const overlapFront = p.z - box.minZ;
      const overlapBack = box.maxZ - p.z;
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapFront, overlapBack);
      if (minOverlap === overlapLeft) p.x = box.minX - radius;
      else if (minOverlap === overlapRight) p.x = box.maxX + radius;
      else if (minOverlap === overlapFront) p.z = box.minZ - radius;
      else p.z = box.maxZ + radius;
      return;
    }

    const closestX = Math.max(box.minX, Math.min(p.x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(p.z, box.maxZ));
    const dx = p.x - closestX;
    const dz = p.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq > radius * radius || distSq < 1e-8) return;
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    p.x += (dx / dist) * push;
    p.z += (dz / dist) * push;
  }
}

/** Slide along walls by resolving X and Z movement separately. */
export function moveWithCollisions(position, delta, collisionSystem, playerRadius = 0.42) {
  _tmp.copy(position);
  _tmp.x += delta.x;
  _tmp.copy(collisionSystem.resolve(_tmp, playerRadius));
  _tmp.z += delta.z;
  return collisionSystem.resolve(_tmp, playerRadius);
}

/** Apply collision correction to a player rig from the camera's world position. */
export function correctRigFromEye(rig, camera, collisionSystem, worldBounds = 45, playerRadius = 0.42) {
  if (!rig || !camera || !collisionSystem) return;
  const eye = _tmp;
  camera.getWorldPosition(eye);
  const resolved = collisionSystem.resolve(eye, playerRadius);
  resolved.x = Math.max(-worldBounds, Math.min(worldBounds, resolved.x));
  resolved.z = Math.max(-worldBounds, Math.min(worldBounds, resolved.z));
  const fixed = collisionSystem.resolve(resolved, playerRadius);
  rig.position.x += fixed.x - eye.x;
  rig.position.z += fixed.z - eye.z;
}
