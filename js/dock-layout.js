/** Shared dock / shore layout (world coordinates). */
export const DOCK_GROUP = { x: 0, z: 3.2 };
/** Shore deck center in dock group local space. */
export const DOCK_SHORE_LOCAL_Z = 12.4;
/** World-space shore deck where the camp path begins. */
export const DOCK_SHORE = { x: 0, z: DOCK_GROUP.z + DOCK_SHORE_LOCAL_Z };
/** Clear spawn on grass just past the shore deck. */
export const DOCK_SPAWN = { x: 0, y: 0, z: DOCK_SHORE.z + 1.2 };

/** Walkable boardwalk strip (world XZ) for collision rails. */
export const DOCK_WALK = {
  centerX: DOCK_GROUP.x,
  halfWidth: 1.4,
  startZ: 0.35,
  endZ: DOCK_SHORE.z + 1.4,
  /** Pier deck top ~1.67m + standing eye offset when raycast misses a gap. */
  plankEyeY: 2.58,
};

export const DOCK_EYE_OFFSET = 0.92;

export function isOnDockWalk(x, z) {
  return (
    Math.abs(x - DOCK_WALK.centerX) <= DOCK_WALK.halfWidth + 0.35 &&
    z >= DOCK_WALK.startZ &&
    z <= DOCK_WALK.endZ
  );
}

/** Dock_Stairs.glb at local z=11.8, scale 0.38 — measured world XZ footprint. */
export const DOCK_STAIRS = {
  centerX: DOCK_GROUP.x,
  minZ: 13.2,
  maxZ: 16.85,
  halfWidth: 1.32,
  /** Mesh ramp is high at the dock end (+Z toward shore goes downhill on the tread). */
  highEyeY: 2.92,
  lowEyeY: 1.77,
  eyeOffset: DOCK_EYE_OFFSET,
};

export function isOnDockStairs(x, z) {
  return (
    Math.abs(x - DOCK_STAIRS.centerX) <= DOCK_STAIRS.halfWidth + 0.35 &&
    z >= DOCK_STAIRS.minZ - 0.15 &&
    z <= DOCK_STAIRS.maxZ + 0.2
  );
}

/** Fallback ramp eye height when mesh raycast misses (high at dock end, lower at shore). */
export function getDockStairEyeHeightFallback(x, z) {
  if (!isOnDockStairs(x, z)) return null;
  const t = (z - DOCK_STAIRS.minZ) / (DOCK_STAIRS.maxZ - DOCK_STAIRS.minZ);
  const surface = DOCK_STAIRS.highEyeY - DOCK_STAIRS.eyeOffset
    + t * ((DOCK_STAIRS.lowEyeY - DOCK_STAIRS.eyeOffset) - (DOCK_STAIRS.highEyeY - DOCK_STAIRS.eyeOffset));
  return surface + DOCK_STAIRS.eyeOffset;
}

/** @deprecated use LakeEnvironment.getDockStairEyeHeight */
export function getDockStairEyeHeight(x, z) {
  return getDockStairEyeHeightFallback(x, z);
}

/** Side rails along the stair ramp so players cannot walk through the mesh. */
export function registerDockStairsCollisions(collisionSystem) {
  const { centerX: cx, minZ, maxZ, halfWidth } = DOCK_STAIRS;
  const railOut = 2.2;
  const treadHalf = 0.48;
  const steps = 8;
  const stepLen = (maxZ - minZ) / steps;
  for (let i = 0; i < steps; i++) {
    const z0 = minZ + i * stepLen;
    const z1 = minZ + (i + 1) * stepLen + 0.04;
    collisionSystem.addBox(cx - halfWidth - railOut, cx - treadHalf, z0, z1);
    collisionSystem.addBox(cx + treadHalf, cx + halfWidth + railOut, z0, z1);
  }
}

/** Side rails + lake-end cap so players stay on the planks. */
export function registerDockWalkCollisions(collisionSystem) {
  const { centerX: cx, halfWidth, startZ, endZ } = DOCK_WALK;
  const railOut = 2.2;
  collisionSystem.addBox(cx - halfWidth - railOut, cx - halfWidth, startZ, DOCK_STAIRS.minZ - 0.05);
  collisionSystem.addBox(cx + halfWidth, cx + halfWidth + railOut, startZ, DOCK_STAIRS.minZ - 0.05);
  collisionSystem.addBox(cx - halfWidth - railOut, cx - halfWidth, DOCK_STAIRS.maxZ + 0.05, endZ);
  collisionSystem.addBox(cx + halfWidth, cx + halfWidth + railOut, DOCK_STAIRS.maxZ + 0.05, endZ);
  collisionSystem.addBox(cx - halfWidth - 0.5, cx + halfWidth + 0.5, -4, startZ);
  registerDockStairsCollisions(collisionSystem);
}
