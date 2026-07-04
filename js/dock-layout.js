/** Shared dock / shore layout (world coordinates). */
export const DOCK_GROUP = { x: 0, z: 3.2 };

/** Pier bridge segment local Z (single span — ends before stairs). */
export const DOCK_BRIDGE_LOCAL_Z = 4.5;
/** Stairs mesh local Z in dock group space. */
export const DOCK_STAIRS_LOCAL_Z = 10.8;
/** Shore deck center in dock group local space (past stairs, no overlap). */
export const DOCK_SHORE_LOCAL_Z = 14.4;

/** World-space shore deck where the camp path begins. */
export const DOCK_SHORE = { x: 0, z: DOCK_GROUP.z + DOCK_SHORE_LOCAL_Z };
/** Clear spawn on grass just past the shore deck. */
export const DOCK_SPAWN = { x: 0, y: 0, z: DOCK_SHORE.z + 1.2 };

/** Walkable boardwalk strip (world XZ) for collision rails. */
export const DOCK_WALK = {
  centerX: DOCK_GROUP.x,
  halfWidth: 1.4,
  /** Tighter X clamp so the player stays on plank tops, not inside rails. */
  collisionHalfWidth: 1.02,
  startZ: 0.35,
  endZ: DOCK_SHORE.z + 1.4,
  /** Pier deck top eye height when raycast misses. */
  plankEyeY: 2.62,
};

export const DOCK_EYE_OFFSET = 0.92;
/** Lift feet slightly above tread tops to avoid clipping into plank meshes. */
export const DOCK_FEET_OFFSET = 0.06;
/** Pier deck tread is ~1.62–1.68m; reject lower ray hits (piles, stringers). */
export const DOCK_PIER_MIN_SURFACE_Y = 1.52;

/** Dock_Stairs.glb at local z=10.8, scale 0.38 — measured world XZ footprint. */
export const DOCK_STAIRS = {
  centerX: DOCK_GROUP.x,
  minZ: 12.2,
  maxZ: 15.85,
  halfWidth: 1.32,
  /** Mesh ramp is high at the dock end (+Z toward shore goes downhill on the tread). */
  highEyeY: 2.92,
  lowEyeY: 1.77,
  eyeOffset: DOCK_EYE_OFFSET,
};

/** Wide shore deck at the camp path — not the narrow pier planks. */
export const DOCK_SHORE_DECK = {
  centerX: DOCK_GROUP.x,
  halfWidth: 2.7,
  /** Top of shore deck mesh (dock group y=0). */
  surfaceY: 0.16,
  minZ: DOCK_STAIRS.maxZ - 0.05,
  maxZ: DOCK_SHORE.z + 1.85,
};

export function isOnPierCorridor(z) {
  return z >= DOCK_WALK.startZ && z < DOCK_STAIRS.minZ;
}

export function isOnPierWalk(x, z) {
  return (
    isOnPierCorridor(z) &&
    Math.abs(x - DOCK_WALK.centerX) <= DOCK_WALK.halfWidth + 0.35
  );
}

export function isOnShoreDeck(x, z) {
  return (
    Math.abs(x - DOCK_SHORE_DECK.centerX) <= DOCK_SHORE_DECK.halfWidth + 0.25 &&
    z >= DOCK_SHORE_DECK.minZ &&
    z <= DOCK_SHORE_DECK.maxZ
  );
}

export function isOnDockWalk(x, z) {
  return isOnPierWalk(x, z) || isOnDockStairs(x, z) || isOnShoreDeck(x, z);
}

export function clampBoardwalkX(x, z, getSurfaceHeight) {
  void getSurfaceHeight;
  const cx = DOCK_WALK.centerX;
  if (isOnDockStairs(x, z)) {
    const hw = DOCK_STAIRS.halfWidth;
    return Math.max(cx - hw, Math.min(cx + hw, x));
  }
  if (isOnPierCorridor(z)) {
    const hw = DOCK_WALK.collisionHalfWidth;
    return Math.max(cx - hw, Math.min(cx + hw, x));
  }
  if (isOnShoreDeck(x, z)) {
    const hw = DOCK_SHORE_DECK.halfWidth;
    return Math.max(DOCK_SHORE_DECK.centerX - hw, Math.min(DOCK_SHORE_DECK.centerX + hw, x));
  }
  return x;
}

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
  const railOut = 0.3;
  const treadHalf = 0.42;
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
  const { centerX: cx, collisionHalfWidth: hw, startZ, endZ } = DOCK_WALK;
  const railOut = 0.3;
  collisionSystem.addBox(cx - hw - railOut, cx - hw, startZ, DOCK_STAIRS.minZ - 0.05);
  collisionSystem.addBox(cx + hw, cx + hw + railOut, startZ, DOCK_STAIRS.minZ - 0.05);
  collisionSystem.addBox(cx - hw - railOut, cx - hw, DOCK_STAIRS.maxZ + 0.05, endZ);
  collisionSystem.addBox(cx + hw, cx + hw + railOut, DOCK_STAIRS.maxZ + 0.05, endZ);
  collisionSystem.addBox(cx - hw - 0.5, cx + hw + 0.5, -4, startZ);
  registerDockStairsCollisions(collisionSystem);
}
