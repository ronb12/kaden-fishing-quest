import * as THREE from "three";
import { CollisionSystem, moveWithCollisions } from "../js/collisions.js";
import { CAMP_ORIGIN, CABIN_SIZE, DOOR_WIDTH } from "../js/campground.js";
import { DOCK_SHORE } from "../js/dock-layout.js";

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

console.log("collision volumes:", c.circles.length, "circles", c.boxes.length, "boxes");
