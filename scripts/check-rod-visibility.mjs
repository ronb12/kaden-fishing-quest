import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const loader = new GLTFLoader();
const gltf = await loader.loadAsync(`file://${root}/assets/models/rod/FishingRod_Lvl1.glb`);

const rod = gltf.scene.clone(true);
rod.scale.setScalar(0.72);
rod.rotation.set(-0.12, Math.PI, 0.02);

const rodGroup = new THREE.Group();
rodGroup.add(rod);

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 200);
camera.position.set(0, 1.6, 8);
camera.lookAt(0, 0, -8);

const rodOffset = new THREE.Vector3(0.34, -0.2, -0.45).applyQuaternion(camera.quaternion);
rodGroup.position.copy(camera.position).add(rodOffset);
rodGroup.quaternion.copy(camera.quaternion);
rodGroup.rotateX(-0.55, true);
rodGroup.rotateY(0.18, true);
rodGroup.rotateZ(-0.08, true);

rodGroup.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(rodGroup);
const ndc = box.getCenter(new THREE.Vector3()).project(camera);
console.log("rod bbox min", box.min.toArray().map((v) => v.toFixed(2)));
console.log("rod bbox max", box.max.toArray().map((v) => v.toFixed(2)));
console.log("rod center NDC", ndc.toArray().map((v) => v.toFixed(2)), "(in view if x,y in [-1,1] and z in [0,1])");
