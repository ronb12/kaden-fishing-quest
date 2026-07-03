/** Shared dock / shore layout (world coordinates). */
export const DOCK_GROUP = { x: 0, z: 3.2 };
/** Shore deck center in dock group local space. */
export const DOCK_SHORE_LOCAL_Z = 12.4;
/** World-space shore deck where the camp path begins. */
export const DOCK_SHORE = { x: 0, z: DOCK_GROUP.z + DOCK_SHORE_LOCAL_Z };
/** Clear spawn on grass just past the shore deck. */
export const DOCK_SPAWN = { x: 0, y: 0, z: DOCK_SHORE.z + 1.2 };
