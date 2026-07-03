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
};

/** Side rails + lake-end cap so players stay on the planks. */
export function registerDockWalkCollisions(collisionSystem) {
  const { centerX: cx, halfWidth, startZ, endZ } = DOCK_WALK;
  const railOut = 2.2;
  collisionSystem.addBox(cx - halfWidth - railOut, cx - halfWidth, startZ, endZ);
  collisionSystem.addBox(cx + halfWidth, cx + halfWidth + railOut, startZ, endZ);
  collisionSystem.addBox(cx - halfWidth - 0.5, cx + halfWidth + 0.5, -4, startZ);
}
