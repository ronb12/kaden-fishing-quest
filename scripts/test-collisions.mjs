import * as THREE from "three";
import { CollisionSystem, moveWithCollisions } from "../js/collisions.js";
import { CAMP_ORIGIN, CABIN_SIZE, DOOR_WIDTH } from "../js/campground.js";
import { DOCK_SHORE, registerDockWalkCollisions, DOCK_WALK } from "../js/dock-layout.js";

const c = new CollisionSystem();
const cx = CAMP_ORIGIN.x;
const cz = CAMP_ORIGIN.z;
const halfW = CABIN_SIZE.width / 2;
const halfD = CABIN_SIZE.depth / 2;
const wall = CABIN_SIZE.wall;

c.addBox(cx - halfW, cx + halfW, cz + halfD - wall, cz + halfD);
c.addBox(cx - halfW, cx - halfW + wall, cz - halfD, cz + halfD);
c.addBox(cx + halfW - wall, cx + halfW, cz - halfD, cz + halfD);
c.addBox(cx - halfW, cx - DOOR_WIDTH / 2, cz - halfD, cz - halfD + wall);
c.addBox(cx + DOOR_WIDTH / 2, cx + halfW, cz - halfD, cz - halfD + wall);
c.addCircle(10, 12, 1.5);
registerDockWalkCollisions(c);

function assert(name, cond) {
  if (!cond) {
    console.error("FAIL:", name);
    process.exitCode = 1;
  } else {
    console.log("ok:", name);
  }
}

// Blocked by back wall.
let p = c.resolve(new THREE.Vector3(cx, 1.6, cz + halfD + 0.2));
assert("back wall blocks", p.z <= cz + halfD + 0.39);

p = c.resolve(new THREE.Vector3(cx, 1.6, cz - halfD - 0.2));
assert("doorway open", p.z < cz - halfD + 0.1);

const start = new THREE.Vector3(10, 1.6, 14);
const moved = moveWithCollisions(start, { x: 0, z: -2 }, c);
assert("tree collision", Math.hypot(moved.x - 10, moved.z - 12) < 1.8);

// Dock center stays walkable; sides are blocked.
const dockCenter = new THREE.Vector3(DOCK_WALK.centerX, 1.6, 8);
const onDock = c.resolve(dockCenter.clone());
assert("dock center walkable", Math.abs(onDock.x - DOCK_WALK.centerX) < 0.05 && Math.abs(onDock.z - 8) < 0.05);

const offSide = c.resolve(new THREE.Vector3(DOCK_WALK.centerX + 2.5, 1.6, 8));
assert("dock side blocked", offSide.x <= DOCK_WALK.centerX + DOCK_WALK.halfWidth + 0.45);

const lakeTry = moveWithCollisions(
  new THREE.Vector3(DOCK_WALK.centerX, 1.6, DOCK_WALK.startZ + 0.15),
  { x: 0, z: -1.2 },
  c
);
assert("lake end blocked", lakeTry.z >= DOCK_WALK.startZ - 0.05);

const shoreExit = c.resolve(new THREE.Vector3(DOCK_SHORE.x, 1.6, DOCK_SHORE.z + 1.2));
assert("shore spawn open", Math.abs(shoreExit.x - DOCK_SHORE.x) < 0.1 && shoreExit.z > DOCK_SHORE.z);

console.log("collision volumes:", c.circles.length, "circles", c.boxes.length, "boxes");
