import * as THREE from "three";
import { getAssets, cloneModel, addRodTipMarker } from "./asset-loader.js";
import { getRodStats } from "./gear-stats.js";

const ROD_LEVEL_CONFIG = {
  1: { scale: 0.72, blank: 0x1c2428, accent: 0x8a9098 },
  2: { scale: 0.74, blank: 0x182228, accent: 0x9aa4b0 },
  3: { scale: 0.76, blank: 0x141c22, accent: 0xa8b8c8 },
  4: { scale: 0.78, blank: 0x101820, accent: 0xc0a050 },
  5: { scale: 0.8, blank: 0x0c1418, accent: 0xd4af37 },
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.1,
    envMapIntensity: opts.envMapIntensity ?? 1,
    ...opts,
  });
}

function enhanceRodMaterials(rod, level = 1) {
  const cfg = ROD_LEVEL_CONFIG[level] || ROD_LEVEL_CONFIG[1];
  rod.traverse((child) => {
    if (!child.isMesh) return;
    child.frustumCulled = false;
    if (!child.material) return;
    const apply = (m) => {
      const next = m.clone();
      const name = (next.name || "").toLowerCase();
      if (name.includes("metal")) {
        next.metalness = 0.9;
        next.roughness = 0.18;
        next.envMapIntensity = 1.6;
        if (level >= 4) next.color.setHex(cfg.accent);
      } else {
        next.metalness = 0.62;
        next.roughness = 0.28;
        next.envMapIntensity = 1.1;
        next.color.setHex(cfg.blank);
      }
      return next;
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(apply)
      : apply(child.material);
  });
}

function orientRodModel(rod) {
  rod.rotation.set(-0.12, Math.PI, 0.02);
}

function buildProceduralRod(rodLevel = 1) {
  const cfg = ROD_LEVEL_CONFIG[Math.min(5, Math.max(1, rodLevel))] || ROD_LEVEL_CONFIG[1];
  const rod = new THREE.Group();
  const carbon = mat(cfg.blank, { metalness: 0.55, roughness: 0.26, envMapIntensity: 1.1 });
  const metal = mat(cfg.accent, { metalness: 0.92, roughness: 0.16, envMapIntensity: 1.5 });
  const cork = mat(0xc49a6c, { roughness: 0.88, metalness: 0.02 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.42, 16), cork);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0.42, 0, 0);
  rod.add(handle);

  const reelSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.12, 12), metal);
  reelSeat.rotation.x = Math.PI / 2;
  reelSeat.position.set(0.18, 0, 0);
  rod.add(reelSeat);

  const reelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 16), metal);
  reelBody.rotation.z = Math.PI / 2;
  reelBody.position.set(0.12, -0.05, 0);
  rod.add(reelBody);

  const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0035, 1.95, 12), carbon);
  blank.rotation.x = Math.PI / 2;
  blank.position.set(-0.72, 0.04, 0);
  rod.add(blank);

  for (let i = 0; i < 5; i++) {
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0018, 6, 12), metal);
    guide.rotation.y = Math.PI / 2;
    guide.position.set(0.28 - i * 0.38, 0.04, 0);
    rod.add(guide);
  }

  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.001, 0.04, 6), mat(0xeeeeee));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(-1.72, 0.04, 0);
  rod.add(tip);

  const tipMarker = new THREE.Object3D();
  tipMarker.position.set(-1.74, 0.04, 0);
  tipMarker.name = "rodTip";
  rod.add(tipMarker);

  rod.scale.setScalar(cfg.scale);
  orientRodModel(rod);
  return { rod, tip: tipMarker };
}

export function buildRealisticRod(rodLevel = 1) {
  const rodMeta = getRodStats(rodLevel);
  const lvl = rodMeta.level;
  const cfg = ROD_LEVEL_CONFIG[lvl];
  const assets = getAssets();
  const gltf = assets?.rod?.[`FishingRod_Lvl${lvl}`];

  if (gltf) {
    const rod = cloneModel(gltf, { scale: cfg.scale, rotationY: 0, animate: false });
    enhanceRodMaterials(rod, lvl);
    orientRodModel(rod);
    rod.userData.rodName = rodMeta.name;
    const tip = addRodTipMarker(rod);
    return { rod, tip };
  }

  const built = buildProceduralRod(lvl);
  built.rod.userData.rodName = rodMeta.name;
  return built;
}

/** Visible reel spool + crank handle for VR reeling animation. */
export function attachReelMechanism(rod) {
  const existing = rod.getObjectByName("reelMechanism");
  if (existing) return existing;

  const mechanism = new THREE.Group();
  mechanism.name = "reelMechanism";
  const metal = mat(0xb0b8c0, { metalness: 0.9, roughness: 0.18, envMapIntensity: 1.4 });

  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.052, 16), metal);
  spool.rotation.z = Math.PI / 2;
  spool.name = "reelSpool";
  mechanism.add(spool);

  const crank = new THREE.Group();
  crank.name = "reelCrank";
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.014), metal);
  arm.position.x = 0.029;
  crank.add(arm);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), metal);
  knob.position.set(0.058, 0, 0);
  knob.name = "reelKnob";
  crank.add(knob);
  mechanism.add(crank);

  const lineGuide = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 12), metal);
  lineGuide.rotation.y = Math.PI / 2;
  lineGuide.position.set(0.03, 0.03, 0);
  mechanism.add(lineGuide);

  mechanism.position.set(0.12, -0.05, 0);
  rod.add(mechanism);
  return mechanism;
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
  const type = bait.meshType || "worm";

  if (gltf) {
    const scale =
      type === "worm" ? 0.14
      : type === "minnow" || type === "crankbait" ? 0.16
      : type === "jig" || type === "krill" ? 0.13
      : type === "spinner" ? 0.15
      : 0.12;
    const mesh = cloneModel(gltf, { scale, rotationY: type === "minnow" ? Math.PI / 2 : 0 });
    if (type === "worm") mesh.rotation.x = 0.4;
    if (type === "jig") mesh.rotation.x = -0.5;
    if (type === "popper") mesh.rotation.x = -0.2;
    group.add(mesh);

    if (type === "spinner") {
      const blade = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 12),
        mat(0xd8dce8, { metalness: 0.95, roughness: 0.1, side: THREE.DoubleSide })
      );
      blade.rotation.y = Math.PI / 2;
      blade.position.set(0.02, 0, 0);
      blade.name = "spinnerBlade";
      group.add(blade);
    }
    if (type === "crankbait" || type === "popper") {
      group.traverse((c) => {
        if (c.isMesh && c.material?.color) c.material.color.lerp(new THREE.Color(bait.color), 0.35);
      });
    }
    group.userData.baitType = type;
    return group;
  }

  const fallback = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), mat(bait.color));
  group.add(fallback);
  return group;
}

export function updateBaitAnimation(baitMesh, time) {
  if (!baitMesh) return;
  const blade = baitMesh.getObjectByName("spinnerBlade");
  if (blade) blade.rotation.z = time * 8;
  if (baitMesh.userData.baitType === "worm") {
    baitMesh.rotation.z = Math.sin(time * 3) * 0.08;
  }
}

export function buildBobber() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 8),
    mat(0xffffff, { roughness: 0.35, metalness: 0.05 })
  );
  stem.position.y = -0.02;
  group.add(stem);

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 16, 12),
    mat(0xf8f8f8, { roughness: 0.28, metalness: 0.06, emissive: 0x222222, emissiveIntensity: 0.15 })
  );
  top.scale.y = 0.75;
  top.position.y = 0.024;
  group.add(top);

  const bottom = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 16, 12),
    mat(0xd42020, { roughness: 0.35, metalness: 0.05 })
  );
  bottom.scale.y = 1.1;
  bottom.position.y = -0.05;
  group.add(bottom);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.0035, 8, 20),
    mat(0xffffff, { roughness: 0.4 })
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.006;
  group.add(band);

  group.traverse((c) => {
    if (c.isMesh) c.renderOrder = 11;
  });
  return group;
}

export function buildHook() {
  const hookMat = mat(0xb8c0c8, { metalness: 0.95, roughness: 0.12, envMapIntensity: 1.4 });
  const hook = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.022, 6), hookMat);
  shank.position.y = -0.011;
  hook.add(shank);
  const curve = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0014, 6, 16, Math.PI * 1.25), hookMat);
  curve.rotation.z = Math.PI / 2;
  curve.position.y = -0.024;
  hook.add(curve);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.0015, 0.004, 4), hookMat);
  barb.rotation.z = Math.PI / 2;
  barb.position.set(0.005, -0.028, 0);
  hook.add(barb);
  return hook;
}

export function buildBiteFish(species) {
  const fish = buildDetailedFish(species, 1.45);
  fish.traverse((c) => {
    if (c.isMesh && c.material) {
      c.material = c.material.clone();
      c.material.transparent = true;
      c.material.opacity = 1;
      c.material.depthWrite = false;
      c.material.emissive = new THREE.Color(species?.color ?? 0x4a90c4);
      c.material.emissiveIntensity = 0.62;
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

export function buildFishingLine() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xc8e8e0,
    emissive: 0x2a5048,
    emissiveIntensity: 0.55,
    roughness: 0.55,
    metalness: 0.08,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 15;
  mesh.name = "fishingLine";
  return mesh;
}

/** Rebuild a visible braided line from rod tip to rig (TubeGeometry — WebGL lines are 1px). */
export function updateFishingLineMesh(lineMesh, points, radius = 0.0022) {
  if (!lineMesh || points.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = Math.max(12, points.length * 3);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  if (lineMesh.geometry) lineMesh.geometry.dispose();
  lineMesh.geometry = geometry;
}

export function buildFishSilhouette() {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({
      color: 0x0e3040,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

export function linePointsWithSag(start, end, segments = 10, sag = 0.12) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = start.clone().lerp(end, t);
    const droop = Math.sin(t * Math.PI) * sag * (1 + t * 0.35);
    p.y -= droop;
    points.push(p);
  }
  return points;
}
