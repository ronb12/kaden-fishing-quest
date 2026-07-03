import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";
import { getRequiredFishModelKeys } from "./data.js";

const BASE = "./assets/models";

const MANIFEST = {
  fish: [
    "Anglerfish", "ArmoredCatfish", "Betta", "BlackLionFish", "Blobfish",
    "BlueGoldfish", "BlueTang", "ButterflyFish", "CardinalFish", "Clownfish",
    "CoralGrouper", "Cowfish", "Flatfish", "FlowerHorn", "GoblinShark",
    "Goldfish", "Humphead", "Koi", "Lionfish", "MandarinFish",
    "MoorishIdol", "ParrotFish", "Piranha", "Puffer", "RedSnapper",
    "RoyalGramma", "Shark", "Sunfish", "Swordfish", "Tang",
    "Tetra", "Tuna", "Turbot", "YellowTang", "ZebraClownFish",
  ],
  rod: ["FishingRod_Lvl1", "FishingRod_Lvl2", "FishingRod_Lvl3", "FishingRod_Lvl4", "FishingRod_Lvl5"],
  bait: ["Worm", "Lure_1", "Lure_2", "Lure_3", "Lure_4", "Lure_5", "Lure_6"],
  env: [
    "Dock_Wide", "Dock_Long", "Dock_Long_NoRope", "Dock_Stairs", "Boat",
    "BirchTree_1", "BirchTree_2", "BirchTree_3",
    "Rock_1", "Rock_2", "Rock_3",
  ],
  kenney: [
    "tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree_thin",
    "rock_largeA", "rock_largeB", "rock_smallA", "rock_smallB", "rock_tallA",
    "plant_bushSmall", "plant_bushLarge", "grass", "lily_small", "log",
    "path_wood", "path_woodCorner", "path_woodEnd", "ground_pathStraight",
    "fence_simple", "fence_simpleLow", "campfire_logs", "log_stack", "log_stackLarge",
  ],
};

let assets = null;

export function getAssets() {
  return assets;
}

export async function loadGameAssets(onProgress) {
  const loader = new GLTFLoader();
  const cache = { fish: {}, rod: {}, bait: {}, env: {}, kenney: {} };
  const requiredFish = new Set(getRequiredFishModelKeys());
  const entries = [];
  for (const [category, names] of Object.entries(MANIFEST)) {
    for (const name of names) {
      if (category === "fish" && !requiredFish.has(name)) continue;
      entries.push({ category, name, url: `${BASE}/${category}/${name}.glb` });
    }
  }

  let done = 0;
  await Promise.all(
    entries.map(async ({ category, name, url }) => {
      try {
        const gltf = await loader.loadAsync(url);
        cache[category][name] = gltf;
      } catch (err) {
        console.warn(`Failed to load ${url}`, err);
      }
      done += 1;
      onProgress?.(done / entries.length, name);
    })
  );

  assets = cache;
  return cache;
}

export function cloneModel(gltf, opts = {}) {
  if (!gltf) return new THREE.Group();
  const {
    scale = 1,
    rotationY,
    animate = false,
    emissive = null,
    emissiveIntensity = 0,
  } = opts;

  const root = gltf.scene.clone(true);
  root.scale.setScalar(scale);
  root.rotation.y = rotationY !== undefined ? rotationY : -Math.PI / 2;

  root.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      if (c.material) {
        const polish = (m) => {
          const next = m.clone();
          if (!next.map && next.color) {
            next.roughness = Math.min(0.95, (next.roughness ?? 0.85) + 0.05);
          }
          return next;
        };
        c.material = Array.isArray(c.material) ? c.material.map(polish) : polish(c.material);
      }
      if (emissive && c.material) {
        c.material = c.material.clone();
        c.material.emissive = new THREE.Color(emissive);
        c.material.emissiveIntensity = emissiveIntensity;
      }
    }
  });

  if (animate && gltf.animations?.length) {
    const mixer = new THREE.AnimationMixer(root);
    const clip =
      gltf.animations.find((a) => /swim|idle/i.test(a.name)) || gltf.animations[0];
    mixer.clipAction(clip).play();
    root.userData.mixer = mixer;
  }

  return root;
}

/** Lay environment planks/docks flat on the ground (Y-up). */
export function layFlat(object) {
  object.rotation.x = -Math.PI / 2;
  return object;
}

/** Sit model base on the ground at floorY (after x/z position is set). */
export function groundAlign(object, floorY = 0) {
  if (!object) return object;
  const box = new THREE.Box3().setFromObject(object);
  object.position.y += floorY - box.min.y;
  return object;
}

export function updateModelAnimations(object, dt) {
  if (!object) return;
  if (object.userData?.mixer) {
    object.userData.mixer.update(dt);
    return;
  }
  object.traverse?.((c) => {
    if (c.userData?.mixer) c.userData.mixer.update(dt);
  });
}

export function addRodTipMarker(rodGroup) {
  const box = new THREE.Box3().setFromObject(rodGroup);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const ends = [];
  if (size.x >= size.y && size.x >= size.z) {
    ends.push(new THREE.Vector3(box.min.x, center.y, center.z));
    ends.push(new THREE.Vector3(box.max.x, center.y, center.z));
  } else if (size.y >= size.z) {
    ends.push(new THREE.Vector3(center.x, box.min.y, center.z));
    ends.push(new THREE.Vector3(center.x, box.max.y, center.z));
  } else {
    ends.push(new THREE.Vector3(center.x, center.y, box.min.z));
    ends.push(new THREE.Vector3(center.x, center.y, box.max.z));
  }
  ends.sort((a, b) => b.z - a.z);

  const tip = new THREE.Object3D();
  tip.position.copy(ends[0]);
  tip.name = "rodTip";
  rodGroup.add(tip);
  return tip;
}
