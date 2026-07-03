import * as THREE from "three";
import { getAssets, cloneModel } from "./asset-loader.js";
import { DOCK_SHORE } from "./dock-layout.js";

export const CAMP_ORIGIN = { x: -14, z: 20 };
export const CABIN_SIZE = { width: 6.2, depth: 5.4, height: 3.1, wall: 0.18 };
export const DOOR_WIDTH = 1.45;

function woodMat(color = 0x8b5a34) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.04 });
}

function plankMat(color = 0xa07040) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
}

function fabricMat(color = 0xc45a40) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
}

export class Campground {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Campground";
    this.colliders = [];
    this.interiorBounds = null;
    this.insideCabin = false;
    this.wasInsideCabin = false;
    this.interiorLights = [];
    this.campFire = null;
    this.build();
    scene.add(this.group);
  }

  build() {
    this.buildPathFromDock();
    this.buildClearedGround();
    this.buildFence();
    this.buildCabin();
    this.buildOutdoorCamp();
    this.buildSigns();
  }

  buildPathFromDock() {
    const assets = getAssets();
    const pathPoints = [
      { x: DOCK_SHORE.x, z: DOCK_SHORE.z, rot: -0.2 },
      { x: -0.5, z: DOCK_SHORE.z + 1.8, rot: 0.05 },
      { x: -1.8, z: DOCK_SHORE.z + 3.5, rot: 0.28 },
      { x: -4.2, z: DOCK_SHORE.z + 5.2, rot: 0.48 },
      { x: -7.2, z: DOCK_SHORE.z + 6.5, rot: 0.68 },
      { x: -10.2, z: DOCK_SHORE.z + 7.2, rot: 0.88 },
      { x: -13, z: CAMP_ORIGIN.z - 1.5, rot: 1.05 },
    ];

    const woodPath = assets?.kenney?.path_wood;
    const woodCorner = assets?.kenney?.path_woodCorner;
    const woodEnd = assets?.kenney?.path_woodEnd;
    const dirtPath = assets?.kenney?.ground_pathStraight;

    pathPoints.forEach((pt, i) => {
      const gltf = i === 0 ? woodEnd : i === pathPoints.length - 1 ? woodCorner : woodPath || dirtPath;
      if (!gltf) {
        const mat = plankMat(0x9a7048);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 1.2), mat);
        plank.position.set(pt.x, 0.04, pt.z);
        plank.rotation.y = pt.rot;
        this.group.add(plank);
        return;
      }
      const tile = cloneModel(gltf, { scale: 2.4, rotationY: pt.rot });
      tile.position.set(pt.x, 0, pt.z);
      this.group.add(tile);
    });
  }

  buildClearedGround() {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(9, 32),
      new THREE.MeshStandardMaterial({ color: 0x5a8048, roughness: 0.95 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(CAMP_ORIGIN.x, 0.02, CAMP_ORIGIN.z);
    pad.receiveShadow = true;
    this.group.add(pad);
  }

  buildFence() {
    const assets = getAssets();
    const fenceGltf = assets?.kenney?.fence_simpleLow || assets?.kenney?.fence_simple;
    const posts = [
      [-20, 15], [-20, 22], [-20, 25], [-8, 25], [-8, 15], [-8, 13],
    ];
    posts.forEach(([x, z], i) => {
      if (!fenceGltf) return;
      const fence = cloneModel(fenceGltf, { scale: 2.2, rotationY: i % 2 === 0 ? 0 : Math.PI / 2 });
      fence.position.set(x, 0, z);
      this.group.add(fence);
    });
  }

  buildCabin() {
    const { x: cx, z: cz } = CAMP_ORIGIN;
    const { width, depth, height, wall } = CABIN_SIZE;
    const halfW = width / 2;
    const halfD = depth / 2;
    const cabin = new THREE.Group();
    cabin.name = "Cabin";
    cabin.position.set(cx, 0, cz);

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width - wall * 2, 0.08, depth - wall * 2),
      plankMat(0xb88858)
    );
    floor.position.y = 0.12;
    cabin.add(floor);

    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.02, 1.8),
      fabricMat(0x8b3a2a)
    );
    rug.position.set(0.4, 0.18, 0.3);
    cabin.add(rug);

    const porch = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.1, 1.6),
      plankMat(0x9a7048)
    );
    porch.position.set(0, 0.08, -halfD - 0.75);
    cabin.add(porch);

    const porchRoof = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.08, 1.8),
      woodMat(0x6a4a28)
    );
    porchRoof.position.set(0, 2.55, -halfD - 0.75);
    cabin.add(porchRoof);

    const porchLeft = this.wallSegment(halfW - 0.2, height, wall);
    porchLeft.position.set(-1.1, height / 2 + 0.12, -halfD - 0.75);
    cabin.add(porchLeft);
    const porchRight = this.wallSegment(halfW - 0.2, height, wall);
    porchRight.position.set(1.1, height / 2 + 0.12, -halfD - 0.75);
    cabin.add(porchRight);

    const backWall = this.wallSegment(width, height, wall);
    backWall.position.set(0, height / 2 + 0.12, halfD - wall / 2);
    cabin.add(backWall);

    const leftWall = this.wallSegment(depth, height, wall);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-halfW + wall / 2, height / 2 + 0.12, 0);
    cabin.add(leftWall);

    const rightWall = this.wallSegment(depth, height, wall);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(halfW - wall / 2, height / 2 + 0.12, 0);
    cabin.add(rightWall);

    const doorHalf = (width - DOOR_WIDTH) / 2;
    const frontLeft = this.wallSegment(doorHalf, height, wall);
    frontLeft.position.set(-halfW + doorHalf / 2, height / 2 + 0.12, -halfD + wall / 2);
    cabin.add(frontLeft);

    const frontRight = this.wallSegment(doorHalf, height, wall);
    frontRight.position.set(halfW - doorHalf / 2, height / 2 + 0.12, -halfD + wall / 2);
    cabin.add(frontRight);

    const lintel = this.wallSegment(DOOR_WIDTH, height * 0.35, wall);
    lintel.position.set(0, height * 0.82, -halfD + wall / 2);
    cabin.add(lintel);

    const roofLeft = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.6, 0.12, depth / 2 + 0.5),
      woodMat(0x5a3a20)
    );
    roofLeft.position.set(0, height + 0.35, 0.35);
    roofLeft.rotation.x = -0.42;
    cabin.add(roofLeft);
    const roofRight = roofLeft.clone();
    roofRight.position.z = -0.35;
    roofRight.rotation.x = 0.42;
    cabin.add(roofRight);

    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.2, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 })
    );
    chimney.position.set(1.6, height + 0.5, 1.2);
    cabin.add(chimney);

    this.buildInteriorFurnishing(cabin);
    this.buildInteriorLights(cabin);

    this.interiorBounds = new THREE.Box3(
      new THREE.Vector3(cx - halfW + wall + 0.05, 0.1, cz - halfD + wall + 0.05),
      new THREE.Vector3(cx + halfW - wall - 0.05, height, cz + halfD - wall - 0.05)
    );
    this.doorBounds = new THREE.Box3(
      new THREE.Vector3(cx - DOOR_WIDTH / 2, 0, cz - halfD - 1.8),
      new THREE.Vector3(cx + DOOR_WIDTH / 2, height, cz - halfD + wall + 0.2)
    );

    this.group.add(cabin);
    this.cabinGroup = cabin;
  }

  wallSegment(length, height, thickness) {
    return new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), woodMat(0x7a4e2a));
  }

  buildInteriorFurnishing(cabin) {
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 2.4), woodMat(0x6a4a28));
    bedFrame.position.set(-1.5, 0.35, 1.1);
    cabin.add(bedFrame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 2.2), fabricMat(0xc8d8e8));
    mattress.position.set(-1.5, 0.58, 1.1);
    cabin.add(mattress);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.45), fabricMat(0xf0f0f0));
    pillow.position.set(-1.5, 0.78, 2.05);
    cabin.add(pillow);

    const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.8), woodMat(0x8b5a34));
    table.position.set(1.2, 0.72, 0.2);
    cabin.add(table);
    const legGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.72, 8);
    [[0.55, 0.3], [0.55, -0.3], [-0.55, 0.3], [-0.55, -0.3]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat(0x6a4a28));
      leg.position.set(1.2 + lx, 0.36, 0.2 + lz);
      cabin.add(leg);
    });

    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.45, 10), woodMat(0x7a4e2a));
    stool.position.set(1.2, 0.34, 1.0);
    cabin.add(stool);

    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.35), woodMat(0x6a4a28));
    shelf.position.set(0, 1.55, 2.15);
    cabin.add(shelf);
    const shelf2 = shelf.clone();
    shelf2.position.y = 2.05;
    cabin.add(shelf2);

    const rodRack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), woodMat(0x5a3a20));
    rodRack.position.set(-0.3, 1.8, 2.12);
    cabin.add(rodRack);
    const rodOnWall = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 1.4, 8), woodMat(0x1a2420));
    rodOnWall.rotation.z = Math.PI / 2;
    rodOnWall.position.set(-0.3, 1.95, 2.05);
    cabin.add(rodOnWall);

    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.28, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffcc66,
        emissive: 0xff9933,
        emissiveIntensity: 0.8,
        roughness: 0.4,
      })
    );
    lantern.position.set(0, 2.35, 0);
    cabin.add(lantern);

    const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.2), woodMat(0x5a3a20));
    windowFrame.position.set(2.95, 1.5, 0.5);
    cabin.add(windowFrame);
    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.75),
      new THREE.MeshStandardMaterial({
        color: 0xa8d8f0,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        metalness: 0.1,
      })
    );
    windowGlass.position.set(2.92, 1.5, 0.5);
    windowGlass.rotation.y = -Math.PI / 2;
    cabin.add(windowGlass);
  }

  buildInteriorLights(cabin) {
    const warm = new THREE.PointLight(0xffa85a, 0.9, 8, 1.6);
    warm.position.set(0, 2.4, 0);
    cabin.add(warm);
    this.interiorLights.push(warm);

    const fill = new THREE.PointLight(0xffe8c8, 0.35, 6, 2);
    fill.position.set(-1.2, 1.2, 1.2);
    cabin.add(fill);
    this.interiorLights.push(fill);
  }

  buildOutdoorCamp() {
    const assets = getAssets();
    const { x: cx, z: cz } = CAMP_ORIGIN;

    const tentMat = fabricMat(0xe85a4f);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 4), tentMat);
    tent.position.set(cx + 5, 1.2, cz + 2);
    tent.rotation.y = Math.PI / 6;
    tent.castShadow = true;
    this.group.add(tent);

    const fireGroup = new THREE.Group();
    const logsGltf = assets?.kenney?.campfire_logs || assets?.kenney?.log_stack;
    if (logsGltf) {
      const fire = cloneModel(logsGltf, { scale: 2.5, rotationY: 0 });
      fireGroup.add(fire);
    } else {
      for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9), woodMat(0x4a3020));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 4) * Math.PI * 2;
        fireGroup.add(log);
      }
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.6, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8833 })
    );
    flame.position.y = 0.35;
    fireGroup.add(flame);
    const fireLight = new THREE.PointLight(0xff6622, 1.2, 10, 1.8);
    fireLight.position.y = 0.6;
    fireGroup.add(fireLight);
    fireGroup.position.set(cx + 3.5, 0.05, cz - 2);
    this.group.add(fireGroup);
    this.campFire = fireGroup;

    const logPile = assets?.kenney?.log_stackLarge || assets?.kenney?.log_stack;
    if (logPile) {
      const pile = cloneModel(logPile, { scale: 2.2, rotationY: 0.4 });
      pile.position.set(cx - 4, 0, cz + 3);
      this.group.add(pile);
    }

    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), woodMat(0x8b5a34));
    table.position.set(cx + 2, 0.72, cz - 1);
    this.group.add(table);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.35), woodMat(0x7a4e2a));
    bench.position.set(cx + 2, 0.42, cz - 1.6);
    this.group.add(bench);
  }

  buildSigns() {
    const postMat = woodMat(0x6a4a28);
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6), postMat);
    signPost.position.set(DOCK_SHORE.x + 0.5, 0.8, DOCK_SHORE.z + 0.6);
    this.group.add(signPost);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 0.08),
      woodMat(0x9a7048)
    );
    sign.position.set(DOCK_SHORE.x + 0.5, 1.5, DOCK_SHORE.z + 0.6);
    this.group.add(sign);

    const cabinSign = sign.clone();
    cabinSign.position.set(CAMP_ORIGIN.x, 2.2, CAMP_ORIGIN.z - CABIN_SIZE.depth / 2 - 1.2);
    cabinSign.scale.set(1.2, 0.8, 1);
    this.group.add(cabinSign);
  }

  isInsideCabin(position) {
    return this.interiorBounds?.containsPoint(position) ?? false;
  }

  resolveCollisions(position) {
    const p = position.clone();
    const cx = CAMP_ORIGIN.x;
    const cz = CAMP_ORIGIN.z;
    const hw = CABIN_SIZE.width / 2;
    const hd = CABIN_SIZE.depth / 2;
    const w = CABIN_SIZE.wall;
    const r = 0.38;

    if (p.x < cx - hw - 2 || p.x > cx + hw + 2 || p.z < cz - hd - 3 || p.z > cz + hd + 2) {
      return p;
    }

    const inDoorway =
      p.z < cz - hd + w + 0.45 &&
      Math.abs(p.x - cx) < DOOR_WIDTH / 2 + 0.05;

    if (p.z + r > cz + hd - w && p.x > cx - hw - r && p.x < cx + hw + r) {
      p.z = cz + hd - w - r;
    }
    if (p.x - r < cx - hw + w && p.z > cz - hd && p.z < cz + hd) {
      p.x = cx - hw + w + r;
    }
    if (p.x + r > cx + hw - w && p.z > cz - hd && p.z < cz + hd) {
      p.x = cx + hw - w - r;
    }
    if (!inDoorway && p.z - r < cz - hd + w) {
      if (p.x < cx - DOOR_WIDTH / 2 - r || p.x > cx + DOOR_WIDTH / 2 + r) {
        p.z = cz - hd + w + r;
      }
    }

    return p;
  }

  update(time, playerPos, onCabinEvent) {
    this.insideCabin = this.isInsideCabin(playerPos);
    if (this.insideCabin && !this.wasInsideCabin) {
      onCabinEvent?.("enter");
    } else if (!this.insideCabin && this.wasInsideCabin) {
      onCabinEvent?.("exit");
    }
    this.wasInsideCabin = this.insideCabin;

    if (this.campFire) {
      const flame = this.campFire.children.find((c) => c.geometry?.type === "ConeGeometry");
      if (flame) {
        flame.scale.y = 0.85 + Math.sin(time * 8) * 0.25;
        flame.scale.x = 0.9 + Math.sin(time * 6) * 0.12;
      }
    }

    const lightBoost = this.insideCabin ? 1 : 0;
    this.interiorLights.forEach((l) => {
      l.intensity = (l === this.interiorLights[0] ? 0.9 : 0.35) + lightBoost * 0.15;
    });
  }
}
