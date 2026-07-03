import * as THREE from "three";

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.1,
    ...opts,
  });
}

function addSegment(group, radiusTop, radiusBottom, length, z, material, castShadow = true) {
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 12), material);
  seg.rotation.x = Math.PI / 2;
  seg.position.z = z;
  if (castShadow) seg.castShadow = true;
  group.add(seg);
  return seg;
}

function buildReel(parent, rodLevel) {
  const reelGroup = new THREE.Group();
  reelGroup.position.set(0.04, 0.02, -0.14);

  const bodyMat = mat(0x2a3238, { metalness: 0.65, roughness: 0.35 });
  const accentMat = mat(0x1a5a8a, { metalness: 0.5, roughness: 0.4 });
  const spoolMat = mat(0x3a3a3a, { metalness: 0.3, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.05), bodyMat);
  body.castShadow = true;
  reelGroup.add(body);

  const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.055, 16), spoolMat);
  spool.rotation.x = Math.PI / 2;
  spool.position.set(0, 0.01, 0.02);
  reelGroup.add(spool);

  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.003, 8, 24, Math.PI), mat(0xaaaaaa, { metalness: 0.8 }));
  bail.rotation.y = Math.PI / 2;
  bail.position.set(0, 0.02, 0.045);
  reelGroup.add(bail);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), mat(0x1a1a1a));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.05, -0.01, -0.01);
  reelGroup.add(handle);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), accentMat);
  knob.position.set(0.08, -0.01, -0.01);
  reelGroup.add(knob);

  if (rodLevel >= 2) {
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.012, 0.052), accentMat);
    accent.position.y = 0.038;
    reelGroup.add(accent);
  }

  parent.add(reelGroup);
  return reelGroup;
}

function buildGuides(parent, startZ, count, rodLevel) {
  const guideMat = mat(0xb8c0c8, { metalness: 0.85, roughness: 0.2 });
  const guides = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = startZ - t * (startZ + 1.35);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008 + t * 0.004, 0.0015, 6, 16), guideMat);
    ring.position.z = z;
    parent.add(ring);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.008), guideMat);
    foot.position.set(0, -0.006, z);
    parent.add(foot);
    guides.push(ring);
  }
  return guides;
}

export function buildRealisticRod(rodLevel = 1) {
  const rod = new THREE.Group();
  const scale = 1 + (rodLevel - 1) * 0.04;

  const corkMat = mat(0xc9a66b, { roughness: 0.92 });
  const corkDark = mat(0x9a7848, { roughness: 0.95 });
  const gripMat = mat(0x1a1410, { roughness: 0.85 });
  const blankMat = mat(0x2e4a38, { roughness: 0.45, metalness: 0.05 });
  const blankTipMat = mat(0x4a6a58, { roughness: 0.35, metalness: 0.08 });
  const feruleMat = mat(0x1a1a1a, { metalness: 0.6, roughness: 0.3 });

  // Butt cap
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.025, 12), feruleMat);
  butt.rotation.x = Math.PI / 2;
  butt.position.z = 0.01;
  rod.add(butt);

  // Cork handle
  addSegment(rod, 0.03, 0.032, 0.14, -0.06, corkMat);
  addSegment(rod, 0.028, 0.03, 0.12, -0.19, corkDark);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.0015, 6, 20), feruleMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -0.04 - i * 0.05;
    rod.add(ring);
  }

  // EVA grip above reel seat
  addSegment(rod, 0.026, 0.028, 0.1, -0.32, gripMat);

  // Reel seat
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.08, 12), feruleMat);
  seat.rotation.x = Math.PI / 2;
  seat.position.z = -0.38;
  rod.add(seat);

  buildReel(rod, rodLevel);

  // Rod blank — tapered segments
  addSegment(rod, 0.022, 0.018, 0.35, -0.6, blankMat);
  addSegment(rod, 0.018, 0.014, 0.38, -0.96, blankMat);
  addSegment(rod, 0.014, 0.01, 0.4, -1.35, blankMat);
  addSegment(rod, 0.01, 0.005, 0.35, -1.72, blankTipMat);

  buildGuides(rod, -0.45, rodLevel >= 3 ? 7 : 6, rodLevel);

  // Tip top guide
  const tipGuide = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.001, 6, 12), mat(0xcccccc, { metalness: 0.9 }));
  tipGuide.position.z = -1.9;
  rod.add(tipGuide);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 8), mat(0xeeeeee, { metalness: 0.5 }));
  tip.position.z = -1.92;
  tip.name = "rodTip";
  rod.add(tip);

  rod.scale.setScalar(scale);
  return { rod, tip };
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
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.001, 6, 12, Math.PI), matFn(0x888888, { metalness: 0.8 }));
      hook.rotation.y = Math.PI / 2;
      hook.position.y = -0.012;
      group.add(hook);
      break;
    }
    case "dough": {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), matFn(color, { roughness: 0.9 }));
      group.add(ball);
      break;
    }
    case "jig": {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), matFn(0x2a2a2a, { metalness: 0.7 }));
      group.add(head);
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.02, 8), matFn(color, { roughness: 0.8 }));
      skirt.rotation.x = Math.PI;
      skirt.position.y = -0.015;
      group.add(skirt);
      break;
    }
    default: {
      const fallback = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 8), matFn(color));
      group.add(fallback);
    }
  }

  return group;
}

export function buildBobber() {
  const group = new THREE.Group();
  const whiteMat = mat(0xf5f5f5, { roughness: 0.4 });
  const redMat = mat(0xcc2222, { roughness: 0.45 });

  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.04, 12), whiteMat);
  top.position.y = 0.02;
  group.add(top);

  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.035, 12), redMat);
  bottom.position.y = -0.015;
  group.add(bottom);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6), mat(0xcccccc, { metalness: 0.6 }));
  stem.position.y = -0.05;
  group.add(stem);

  return group;
}

export function buildHook() {
  const hookMat = mat(0x999999, { metalness: 0.85, roughness: 0.25 });
  const hook = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.018, 4), hookMat);
  shank.position.y = -0.009;
  hook.add(shank);
  const curve = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.001, 4, 12, Math.PI * 1.2), hookMat);
  curve.rotation.z = Math.PI / 2;
  curve.position.y = -0.02;
  hook.add(curve);
  return hook;
}
