import * as THREE from "three";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.1,
    ...opts,
  });
}

function addTubeAlongCurve(parent, curve, radius, segments, material, tubular = 64) {
  const geo = new THREE.TubeGeometry(curve, tubular, radius, segments, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildReel(parent) {
  const reel = new THREE.Group();
  reel.position.set(0.035, -0.01, -0.22);

  const graphite = mat(0x1a1a1a, { metalness: 0.7, roughness: 0.35 });
  const metal = mat(0xb0b8c0, { metalness: 0.92, roughness: 0.18 });
  const gold = mat(0xc9a227, { metalness: 0.85, roughness: 0.25 });

  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.055, 16), graphite);
  housing.rotation.x = Math.PI / 2;
  reel.add(housing);

  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.034, 0.048, 20), metal);
  spool.rotation.x = Math.PI / 2;
  spool.position.z = 0.01;
  reel.add(spool);

  const lineOnSpool = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24), mat(0xdddddd));
  lineOnSpool.rotation.x = Math.PI / 2;
  lineOnSpool.position.z = 0.02;
  reel.add(lineOnSpool);

  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 8, 28, Math.PI * 1.1), metal);
  bail.rotation.y = Math.PI / 2;
  bail.position.set(0, 0.012, 0.038);
  reel.add(bail);

  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.007, 0.007), metal);
  crankArm.position.set(0.05, -0.008, -0.01);
  reel.add(crankArm);

  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 12), gold);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.078, -0.008, -0.01);
  reel.add(knob);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.04), graphite);
  foot.position.y = -0.028;
  reel.add(foot);

  parent.add(reel);
  return reel;
}

function buildGuides(parent, points) {
  const guideMat = mat(0xd8e0e8, { metalness: 0.9, roughness: 0.15 });
  points.forEach((z, i) => {
    const r = 0.007 + i * 0.002;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0018, 8, 20), guideMat);
    ring.position.set(0, 0.002, z);
    parent.add(ring);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.014, 0.01), guideMat);
    leg.position.set(0, -0.006, z);
    parent.add(leg);
  });
}

export function buildRealisticRod(rodLevel = 1) {
  const rod = new THREE.Group();
  const scale = 1.25 + (rodLevel - 1) * 0.06;

  const cork = mat(0xbf9b5e, { roughness: 0.95 });
  const corkRing = mat(0x8a6a3e, { roughness: 0.98 });
  const eva = mat(0x111111, { roughness: 0.88 });
  const carbon = mat(0x1a2420, { metalness: 0.35, roughness: 0.28 });
  const carbonTip = mat(0x2a3a32, { metalness: 0.45, roughness: 0.22 });
  const seat = mat(0x0a0a0a, { metalness: 0.75, roughness: 0.3 });

  // Cork handle
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.04),
    new THREE.Vector3(0, 0, -0.04),
    new THREE.Vector3(0, 0, -0.12),
    new THREE.Vector3(0, 0, -0.2),
  ]);
  addTubeAlongCurve(rod, handleCurve, 0.034, 14, cork, 24);

  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.002, 8, 24), corkRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -0.02 - i * 0.028;
    rod.add(ring);
  }

  // EVA foregrip
  const gripCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -0.24),
    new THREE.Vector3(0, 0, -0.32),
    new THREE.Vector3(0, 0, -0.38),
  ]);
  addTubeAlongCurve(rod, gripCurve, 0.028, 12, eva, 16);

  // Reel seat
  const seatMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.1, 14), seat);
  seatMesh.rotation.x = Math.PI / 2;
  seatMesh.position.z = -0.44;
  rod.add(seatMesh);

  buildReel(rod);

  // Carbon blank — curved casting rod
  const blankCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.005, -0.5),
    new THREE.Vector3(0, 0.02, -0.72),
    new THREE.Vector3(0, 0.06, -0.98),
    new THREE.Vector3(0, 0.12, -1.28),
    new THREE.Vector3(0, 0.18, -1.58),
    new THREE.Vector3(0, 0.22, -1.88),
    new THREE.Vector3(0, 0.24, -2.1),
  ]);

  const blankParts = [
    { t: 0, r: 0.018 },
    { t: 0.35, r: 0.014 },
    { t: 0.65, r: 0.01 },
    { t: 1, r: 0.004 },
  ];
  for (let i = 0; i < blankParts.length - 1; i++) {
    const t0 = blankParts[i].t;
    const t1 = blankParts[i + 1].t;
    const pts = blankCurve.getPoints(32).slice(
      Math.floor(t0 * 32),
      Math.floor(t1 * 32) + 1
    );
    if (pts.length < 2) continue;
    const segCurve = new THREE.CatmullRomCurve3(pts);
    const r = (blankParts[i].r + blankParts[i + 1].r) / 2;
    addTubeAlongCurve(rod, segCurve, r, 10, i > 1 ? carbonTip : carbon, 20);
  }

  buildGuides(rod, [-0.52, -0.78, -1.05, -1.35, -1.65, -1.95]);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), mat(0xffffff, { metalness: 0.6 }));
  tip.position.set(0, 0.24, -2.12);
  tip.name = "rodTip";
  rod.add(tip);

  const buttCap = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), seat);
  buttCap.position.set(0, 0, 0.05);
  rod.add(buttCap);

    rod.scale.setScalar(scale);
    return { rod, tip };
}

export function buildDetailedFish(species, size = 1) {
  const group = new THREE.Group();
  const color = species?.color ?? 0x4a90c4;
  const belly = new THREE.Color(color).lerp(new THREE.Color(0xf0e8d8), 0.35);

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.05,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: belly,
    roughness: 0.5,
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.7),
    roughness: 0.55,
    side: THREE.DoubleSide,
  });

  const s = size * (0.8 + (species?.weight?.[1] || 3) * 0.04);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 16, 12), bodyMat);
  body.scale.set(2.4, 0.7, 1.1);
  group.add(body);

  const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12 * s, 12, 8), bellyMat);
  bellyMesh.scale.set(2.0, 0.45, 0.9);
  bellyMesh.position.y = -0.03 * s;
  group.add(bellyMesh);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s, 0.22 * s, 4), finMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.34 * s;
  group.add(tail);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.14 * s, 3), finMat);
  dorsal.rotation.x = Math.PI / 2;
  dorsal.position.set(0.02 * s, 0.12 * s, 0);
  group.add(dorsal);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.018 * s, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3 })
  );
  eye.position.set(0.22 * s, 0.04 * s, 0.07 * s);
  group.add(eye);
  const eye2 = eye.clone();
  eye2.position.z = -0.07 * s;
  group.add(eye2);

  return group;
}

export function buildBaitMesh(bait) {
  const group = new THREE.Group();
  if (!bait) return group;
  const color = bait.color;
  const matFn = (c, opts = {}) => mat(c, opts);

  switch (bait.meshType) {
    case "worm": {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.05, 4, 8), matFn(color));
      body.rotation.z = Math.PI / 2;
      group.add(body);
      break;
    }
    case "minnow": {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.035, 4, 8), matFn(color));
      body.rotation.z = Math.PI / 2;
      group.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.015, 4), matFn(0x6a9ab0));
      tail.rotation.z = -Math.PI / 2;
      tail.position.x = -0.028;
      group.add(tail);
      break;
    }
    case "cricket": {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), matFn(color));
      body.scale.set(1.4, 0.8, 1);
      group.add(body);
      break;
    }
    case "spinner": {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.025, 0.012), matFn(0xd4d4d4, { metalness: 0.9 }));
      group.add(blade);
      break;
    }
    case "dough": {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), matFn(color, { roughness: 0.9 })));
      break;
    }
    case "jig": {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), matFn(0x2a2a2a, { metalness: 0.7 })));
      break;
    }
    default:
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), matFn(color)));
  }
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
  const fish = buildDetailedFish(species, 1.35);
  fish.traverse((c) => {
    if (c.isMesh && c.material) {
      c.material = c.material.clone();
      c.material.emissive = new THREE.Color(species?.color ?? 0x4a90c4);
      c.material.emissiveIntensity = 0.15;
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
