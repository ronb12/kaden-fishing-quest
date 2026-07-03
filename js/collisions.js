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

  resolve(position, playerRadius = 0.38) {
    const p = position.clone();
    for (let pass = 0; pass < 3; pass++) {
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
      const spansCenter = box.minX < 0 && box.maxX > 0;
      if (spansCenter) {
        if (p.z - box.minZ <= box.maxZ - p.z) p.z = box.minZ - radius;
        else p.z = box.maxZ + radius;
      } else if (box.minX >= 0) {
        p.x = box.minX - radius;
      } else {
        p.x = box.maxX + radius;
      }
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
export function moveWithCollisions(position, delta, collisionSystem, playerRadius = 0.38) {
  _tmp.copy(position);
  _tmp.x += delta.x;
  _tmp.copy(collisionSystem.resolve(_tmp, playerRadius));
  _tmp.z += delta.z;
  return collisionSystem.resolve(_tmp, playerRadius);
}
