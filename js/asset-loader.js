import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";

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
  ],
};

let assets = null;

export function getAssets() {
  return assets;
}

export async function loadGameAssets(onProgress) {
  const loader = new GLTFLoader();
  const cache = { fish: {}, rod: {}, bait: {}, env: {}, kenney: {} };
  const entries = [];
  for (const [category, names] of Object.entries(MANIFEST)) {
    for (const name of names) {
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
    rotationY = -Math.PI / 2,
    animate = false,
    emissive = null,
    emissiveIntensity = 0,
  } = opts;

  const root = gltf.scene.clone(true);
  root.scale.setScalar(scale);
  if (rotationY) root.rotation.y = rotationY;

  root.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
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

export function updateModelAnimations(object, dt) {
  object?.traverse?.((c) => {
    if (c.userData?.mixer) c.userData.mixer.update(dt);
  });
  if (object?.userData?.mixer) object.userData.mixer.update(dt);
}

export function addRodTipMarker(rodGroup) {
  const box = new THREE.Box3().setFromObject(rodGroup);
  const tip = new THREE.Object3D();
  tip.position.set(
    (box.min.x + box.max.x) / 2,
    box.max.y,
    box.max.z
  );
  tip.name = "rodTip";
  rodGroup.add(tip);
  return tip;
}
