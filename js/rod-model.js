import * as THREE from "three";
import { getAssets, cloneModel, addRodTipMarker } from "./asset-loader.js";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.1,
    ...opts,
  });
}

function buildProceduralRod(rodLevel = 1) {
  const rod = new THREE.Group();
  const carbon = mat(0x1a2420, { metalness: 0.35, roughness: 0.28 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.35, 12), mat(0xbf9b5e));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.1;
  rod.add(handle);
  const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 1.8, 10), carbon);
  blank.rotation.x = Math.PI / 2;
  blank.position.set(0, 0.08, -0.85);
  rod.add(blank);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), mat(0xffffff));
  tip.position.set(0, 0.08, -1.75);
  tip.name = "rodTip";
  rod.add(tip);
  rod.scale.setScalar(1.1 + (rodLevel - 1) * 0.05);
  return { rod, tip };
}

export function buildRealisticRod(rodLevel = 1) {
  const assets = getAssets();
  const lvl = Math.min(5, Math.max(1, rodLevel));
  const gltf = assets?.rod?.[`FishingRod_Lvl${lvl}`];

  if (gltf) {
    const rod = cloneModel(gltf, { scale: 0.55, rotationY: Math.PI, animate: false });
    rod.rotation.x = -0.15;
    const tip = addRodTipMarker(rod);
    return { rod, tip };
  }

  return buildProceduralRod(rodLevel);
}

function buildProceduralFish(species, size = 1) {
  const group = new THREE.Group();
  const color = species?.color ?? 0x4a90c4;
  const bodyMat = mat(color, { roughness: 0.45 });
  const s = size * (0.8 + (species?.weight?.[1] || 3) * 0.04);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 16, 12), bodyMat);
  body.scale.set(2.4, 0.7, 1.1);
  group.add(body);
  return group;
}

export function buildDetailedFish(species, size = 1) {
  const assets = getAssets();
  const key = species?.modelKey || "Goldfish";
  const gltf = assets?.fish?.[key];
  const fishScale = 0.65 * size * (0.85 + (species?.weight?.[1] || 3) * 0.03);

  if (gltf) {
    return cloneModel(gltf, {
      scale: fishScale,
      rotationY: -Math.PI / 2,
      animate: true,
    });
  }
  return buildProceduralFish(species, size);
}

export function buildBaitMesh(bait) {
  const group = new THREE.Group();
  if (!bait) return group;

  const assets = getAssets();
  const key = bait.modelKey;
  const gltf = key ? assets?.bait?.[key] : null;

  if (gltf) {
    const mesh = cloneModel(gltf, { scale: 0.12, rotationY: 0 });
    group.add(mesh);
    return group;
  }

  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), mat(bait.color)));
  return group;
}

export function buildBobber() {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.028, 0.04, 12),
    mat(0xf8f8f8, { roughness: 0.35 })
  );
  top.position.y = 0.02;
  group.add(top);
  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.022, 0.035, 12),
    mat(0xcc2222, { roughness: 0.4 })
  );
  bottom.position.y = -0.015;
  group.add(bottom);
  return group;
}

export function buildHook() {
  const hookMat = mat(0xaaaaaa, { metalness: 0.9, roughness: 0.2 });
  const hook = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 4), hookMat);
  shank.position.y = -0.01;
  hook.add(shank);
  const curve = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0012, 4, 12, Math.PI * 1.2), hookMat);
  curve.rotation.z = Math.PI / 2;
  curve.position.y = -0.022;
  hook.add(curve);
  return hook;
}

export function buildBiteFish(species) {
  const fish = buildDetailedFish(species, 1.2);
  fish.traverse((c) => {
    if (c.isMesh && c.material) {
      c.material = c.material.clone();
      c.material.emissive = new THREE.Color(species?.color ?? 0x4a90c4);
      c.material.emissiveIntensity = 0.12;
    }
  });
  return fish;
}

export function buildSplashRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.09, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}
