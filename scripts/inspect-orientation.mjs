import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const loader = new GLTFLoader();

function loadGlb(rel) {
  const buf = readFileSync(path.join(root, rel));
  return new Promise((resolve, reject) => loader.parse(buf.buffer, "", resolve, reject));
}

function dims(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const s = new THREE.Vector3();
  box.getSize(s);
  return s.toArray().map((v) => +v.toFixed(2));
}

const gltf = await loadGlb("assets/models/kenney/path_wood.glb");
const base = gltf.scene.clone(true);
base.scale.setScalar(2.2);
console.log("raw scale2.2", dims(base));

const y0 = base.clone(true);
y0.scale.setScalar(2.2);
y0.rotation.y = 0.5;
console.log("rotY 0.5", dims(y0));

const yDef = base.clone(true);
yDef.scale.setScalar(2.2);
yDef.rotation.y = -Math.PI / 2;
console.log("rotY -90", dims(yDef));

const dock = await loadGlb("assets/models/env/Dock_Long_NoRope.glb");
const seg = dock.scene.clone(true);
seg.scale.setScalar(0.4);
seg.rotation.y = 0;
console.log("dock seg scale0.4 rot0", dims(seg));
seg.position.set(0, 0, 10.7);
const box = new THREE.Box3().setFromObject(seg);
console.log("dock minY maxY", box.min.y.toFixed(2), box.max.y.toFixed(2));
