import * as THREE from "three";
import { getAssets, cloneModel } from "./asset-loader.js";
import { DOCK_SHORE } from "./dock-layout.js";

export const CAMP_ORIGIN = { x: -14, z: 20 };
export const CABIN_SIZE = { width: 9.6, depth: 8.4, height: 3.65, wall: 0.2 };
export const DOOR_WIDTH = 1.75;

/** Keep trees and props out of the cabin and campground pad. */
export function isClearOfCampground(x, z) {
  const padW = CABIN_SIZE.width / 2 + 3.5;
  const padD = CABIN_SIZE.depth / 2 + 4.5;
  return Math.abs(x - CAMP_ORIGIN.x) >= padW || Math.abs(z - CAMP_ORIGIN.z) >= padD;
}

const _rayDir = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

function woodMat(color = 0x8b5a34) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.04 });
}

function plankMat(color = 0xa07040) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02 });
}

function fabricMat(color = 0xc45a40) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
}

function metalMat(color = 0x888888) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75 });
}

export class Campground {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Campground";
    this.interiorBounds = null;
    this.insideCabin = false;
    this.wasInsideCabin = false;
    this.interiorLights = [];
    this.interactables = [];
    this.campFire = null;
    this.cabinGroup = null;
    this.lanternOn = true;
    this.fireplaceOn = true;
    this.lanternLight = null;
    this.fireplaceLight = null;
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

  tagInteractable(object, id, label) {
    object.userData.interactId = id;
    object.userData.interactLabel = label;
    return object;
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
      new THREE.CircleGeometry(11, 32),
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
      [-22, 15], [-22, 24], [-22, 27], [-6, 27], [-6, 15], [-6, 13],
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

    const rug = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.02, 2.8), fabricMat(0x8b3a2a));
    rug.position.set(0.2, 0.18, 0.1);
    cabin.add(rug);

    const porch = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 2.2), plankMat(0x9a7048));
    porch.position.set(0, 0.08, -halfD - 1.0);
    cabin.add(porch);

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 2.4), woodMat(0x6a4a28));
    porchRoof.position.set(0, height + 0.1, -halfD - 1.0);
    cabin.add(porchRoof);

    const porchLeft = this.wallSegment(halfW - 0.3, height, wall);
    porchLeft.position.set(-1.6, height / 2 + 0.12, -halfD - 1.0);
    cabin.add(porchLeft);
    const porchRight = this.wallSegment(halfW - 0.3, height, wall);
    porchRight.position.set(1.6, height / 2 + 0.12, -halfD - 1.0);
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

    const lintel = this.wallSegment(DOOR_WIDTH, height * 0.32, wall);
    lintel.position.set(0, height * 0.84, -halfD + wall / 2);
    cabin.add(lintel);

    const roofLeft = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.8, 0.12, depth / 2 + 0.6),
      woodMat(0x5a3a20)
    );
    roofLeft.position.set(0, height + 0.4, 0.45);
    roofLeft.rotation.x = -0.42;
    cabin.add(roofLeft);
    const roofRight = roofLeft.clone();
    roofRight.position.z = -0.45;
    roofRight.rotation.x = 0.42;
    cabin.add(roofRight);

    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.4, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.9 })
    );
    chimney.position.set(2.4, height + 0.55, 2.0);
    cabin.add(chimney);

    this.buildInteriorFurnishing(cabin, halfW, halfD, height);
    this.buildInteriorLights(cabin);

    this.interiorBounds = new THREE.Box3(
      new THREE.Vector3(cx - halfW + wall + 0.05, 0.1, cz - halfD + wall + 0.05),
      new THREE.Vector3(cx + halfW - wall - 0.05, height, cz + halfD - wall - 0.05)
    );

    this.group.add(cabin);
    this.cabinGroup = cabin;
    this.collectInteractables();
  }

  wallSegment(length, height, thickness) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thickness), woodMat(0x7a4e2a));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  addWindow(cabin, x, y, z, rotY, w = 1.3, h = 1.0) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, h + 0.15, w + 0.15), woodMat(0x5a3a20));
    frame.position.set(x, y, z);
    frame.rotation.y = rotY;
    cabin.add(frame);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        color: 0xa8d8f0,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        metalness: 0.1,
      })
    );
    glass.position.copy(frame.position);
    glass.rotation.copy(frame.rotation);
    const offset = 0.06;
    if (Math.abs(rotY) < 0.1) glass.position.z += offset;
    else if (Math.abs(rotY - Math.PI / 2) < 0.1) glass.position.x += offset;
    else if (Math.abs(rotY + Math.PI / 2) < 0.1) glass.position.x -= offset;
    cabin.add(glass);
  }

  buildInteriorFurnishing(cabin, halfW, halfD, height) {
    // --- Bedroom (back-left) ---
    const bedGroup = new THREE.Group();
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.38, 2.8), woodMat(0x6a4a28));
    bedFrame.position.set(0, 0.19, 0);
    bedGroup.add(bedFrame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.24, 2.6), fabricMat(0xc8d8e8));
    mattress.position.set(0, 0.44, 0);
    bedGroup.add(mattress);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.5), fabricMat(0xf0f0f0));
    pillow.position.set(0, 0.66, 1.05);
    bedGroup.add(pillow);
    bedGroup.position.set(-2.8, 0, 2.6);
    cabin.add(bedGroup);

    const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.45), woodMat(0x6a4a28));
    nightstand.position.set(-4.0, 0.28, 1.5);
    cabin.add(nightstand);

    const dresser = this.tagInteractable(
      new THREE.Group(),
      "dresser",
      "Open dresser (journal)"
    );
    const dresserBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.55), woodMat(0x6a4a28));
    dresserBody.position.y = 0.45;
    dresser.add(dresserBody);
    const journal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.38), fabricMat(0x8b4513));
    journal.position.set(0, 0.94, 0.05);
    dresser.add(journal);
    dresser.position.set(-3.6, 0, 3.5);
    cabin.add(dresser);

    // --- Living / dining (center) ---
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.1), woodMat(0x8b5a34));
    table.position.set(0.3, 0.76, -0.2);
    cabin.add(table);
    const legGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.76, 8);
    [[0.8, 0.4], [0.8, -0.4], [-0.8, 0.4], [-0.8, -0.4]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat(0x6a4a28));
      leg.position.set(0.3 + lx, 0.38, -0.2 + lz);
      cabin.add(leg);
    });

    [[-0.9, 0.9], [1.5, -0.8]].forEach(([cx, cz]) => {
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), woodMat(0x7a4e2a));
      chair.position.set(cx, 0.46, cz);
      cabin.add(chair);
      const chairLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.46, 8), woodMat(0x6a4a28));
      chairLeg.position.set(cx, 0.23, cz);
      cabin.add(chairLeg);
    });

    const coffee = this.tagInteractable(
      new THREE.Group(),
      "coffee",
      "Sip coffee"
    );
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10), fabricMat(0xf5f5f0));
    mug.position.y = 0.06;
    coffee.add(mug);
    coffee.position.set(0.6, 0.8, 0.1);
    cabin.add(coffee);

    // --- Kitchen nook (right wall) ---
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 2.8), woodMat(0x6a4a28));
    counter.position.set(halfW - 0.65, 0.45, 0.5);
    cabin.add(counter);

    const kettle = this.tagInteractable(
      new THREE.Group(),
      "kettle",
      "Boil kettle"
    );
    const kettleBody = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), metalMat(0xaaaaaa));
    kettleBody.scale.y = 0.85;
    kettleBody.position.y = 0.14;
    kettle.add(kettleBody);
    kettle.position.set(halfW - 0.65, 0.92, 1.2);
    cabin.add(kettle);

    const stove = this.tagInteractable(
      new THREE.Group(),
      "stove",
      "Check camp stove"
    );
    const stoveTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), metalMat(0x555555));
    stoveTop.position.y = 0.03;
    stove.add(stoveTop);
    const burner = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 16), metalMat(0x333333));
    burner.rotation.x = Math.PI / 2;
    burner.position.y = 0.07;
    stove.add(burner);
    stove.position.set(halfW - 0.65, 0.92, -0.5);
    cabin.add(stove);

    // --- Tackle corner (front-right) ---
    const rodRack = this.tagInteractable(
      new THREE.Group(),
      "rod-rack",
      "Inspect rod rack"
    );
    const rackPost = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), woodMat(0x5a3a20));
    rackPost.position.y = 0.8;
    rodRack.add(rackPost);
    for (let i = 0; i < 3; i++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 1.6, 8), woodMat(0x1a2420));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(-0.2 + i * 0.2, 1.1 + i * 0.15, 0);
      rodRack.add(rod);
    }
    rodRack.position.set(2.8, 0, -2.2);
    cabin.add(rodRack);

    const tackleBox = this.tagInteractable(
      new THREE.Group(),
      "tackle-box",
      "Open tackle box"
    );
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.42), metalMat(0x3d5a3a));
    box.position.y = 0.14;
    tackleBox.add(box);
    const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.42), metalMat(0x4a6a48));
    boxLid.position.set(0, 0.3, -0.04);
    boxLid.rotation.x = -0.5;
    tackleBox.add(boxLid);
    tackleBox.position.set(3.6, 0, -2.8);
    cabin.add(tackleBox);

    const gearLocker = this.tagInteractable(
      new THREE.Group(),
      "gear-locker",
      "Open gear locker"
    );
    const locker = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.45), metalMat(0x4a4a52));
    locker.position.y = 0.85;
    gearLocker.add(locker);
    const lockerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), metalMat(0xcccccc));
    lockerHandle.rotation.z = Math.PI / 2;
    lockerHandle.position.set(0.35, 0.9, 0.24);
    gearLocker.add(lockerHandle);
    gearLocker.position.set(3.8, 0, 0.8);
    cabin.add(gearLocker);

    // --- Fireplace (back wall) ---
    const fireplace = this.tagInteractable(
      new THREE.Group(),
      "fireplace",
      "Toggle fireplace"
    );
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95 }));
    hearth.position.y = 0.25;
    fireplace.add(hearth);
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.35), woodMat(0x5a3a20));
    mantel.position.set(0, 0.95, -0.1);
    fireplace.add(mantel);
    const fireLogs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.35), woodMat(0x4a3020));
    fireLogs.position.set(0, 0.42, 0.05);
    fireplace.add(fireLogs);
    const ember = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.85 })
    );
    ember.rotation.x = -Math.PI / 2;
    ember.position.set(0, 0.52, 0.1);
    ember.name = "fireplaceEmber";
    fireplace.add(ember);
    fireplace.position.set(0.5, 0, halfD - 0.85);
    cabin.add(fireplace);

    // --- Entry area ---
    const coatRack = this.tagInteractable(
      new THREE.Group(),
      "coat-rack",
      "Check coat rack"
    );
    const rackPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 8), woodMat(0x5a3a20));
    rackPole.position.y = 0.9;
    coatRack.add(rackPole);
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.08), fabricMat(0x2a4a6a));
    coat.position.set(0.15, 1.2, 0);
    coatRack.add(coat);
    coatRack.position.set(-2.0, 0, -2.8);
    cabin.add(coatRack);

    const boots = this.tagInteractable(
      new THREE.Group(),
      "boots",
      "Inspect fishing boots"
    );
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.32), fabricMat(0x3a2a1a));
    bootL.position.set(-0.12, 0.11, 0);
    boots.add(bootL);
    const bootR = bootL.clone();
    bootR.position.x = 0.12;
    boots.add(bootR);
    boots.position.set(1.8, 0, -3.2);
    cabin.add(boots);

    // --- Shelves & wall items ---
    const shelfGroup = new THREE.Group();
    [1.6, 2.15, 2.7].forEach((y) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.35), woodMat(0x6a4a28));
      shelf.position.set(-halfW + 0.55, y, 0);
      shelfGroup.add(shelf);
    });
    cabin.add(shelfGroup);

    const trophy = this.tagInteractable(
      new THREE.Group(),
      "trophy",
      "View trophy fish"
    );
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.06), woodMat(0x5a3a20));
    trophy.add(plaque);
    const fishMount = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fabricMat(0xc0a040));
    fishMount.scale.set(2, 0.7, 0.8);
    fishMount.position.set(0, 0, 0.06);
    trophy.add(fishMount);
    trophy.position.set(-halfW + 0.55, 2.0, 0.8);
    trophy.rotation.y = Math.PI / 2;
    cabin.add(trophy);

    const zoneMap = this.tagInteractable(
      new THREE.Group(),
      "zone-map",
      "Study lake map"
    );
    const mapBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.05), woodMat(0x5a3a20));
    zoneMap.add(mapBoard);
    const mapPaper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.62),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.9 })
    );
    mapPaper.position.z = 0.03;
    zoneMap.add(mapPaper);
    zoneMap.position.set(0, 1.85, halfD - 0.35);
    cabin.add(zoneMap);

    const lantern = this.tagInteractable(
      new THREE.Group(),
      "lantern",
      "Toggle lantern"
    );
    const lanternMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.32, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffcc66,
        emissive: 0xff9933,
        emissiveIntensity: 0.8,
        roughness: 0.4,
      })
    );
    lanternMesh.position.y = 0.16;
    lantern.add(lanternMesh);
    lantern.position.set(-0.5, height - 0.15, 0);
    cabin.add(lantern);

    const radio = this.tagInteractable(
      new THREE.Group(),
      "radio",
      "Turn on radio"
    );
    const radioBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.22), woodMat(0x4a3020));
    radio.add(radioBody);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), metalMat(0xcccccc));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.1, 0.1, 0.12);
    radio.add(dial);
    radio.position.set(-4.0, 0.94, 1.5);
    cabin.add(radio);

    // Windows
    this.addWindow(cabin, halfW - 0.12, 1.65, 0.5, -Math.PI / 2);
    this.addWindow(cabin, -halfW + 0.12, 1.65, -0.5, Math.PI / 2);
    this.addWindow(cabin, 0, 1.75, halfD - 0.12, 0, 1.5, 0.9);
  }

  buildInteriorLights(cabin) {
    const warm = new THREE.PointLight(0xffa85a, 1.0, 12, 1.6);
    warm.position.set(0, 2.8, 0);
    cabin.add(warm);
    this.interiorLights.push(warm);
    this.lanternLight = warm;

    const fill = new THREE.PointLight(0xffe8c8, 0.4, 8, 2);
    fill.position.set(-2.5, 1.5, 2.0);
    cabin.add(fill);
    this.interiorLights.push(fill);

    const fpLight = new THREE.PointLight(0xff6622, 0.7, 6, 2);
    fpLight.position.set(0.5, 0.8, CABIN_SIZE.depth / 2 - 1.2);
    cabin.add(fpLight);
    this.fireplaceLight = fpLight;
    this.interiorLights.push(fpLight);
  }

  collectInteractables() {
    this.interactables = [];
    this.cabinGroup?.traverse((c) => {
      if (c.userData?.interactId) this.interactables.push(c);
    });
  }

  pickInteractable(camera, maxDist = 2.8) {
    if (!this.insideCabin || !this.interactables.length) return null;
    _rayDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _raycaster.set(camera.position, _rayDir);
    _raycaster.far = maxDist;
    const hits = _raycaster.intersectObjects(this.interactables, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        if (node.userData?.interactId) {
          return { id: node.userData.interactId, label: node.userData.interactLabel };
        }
        node = node.parent;
      }
    }
    return null;
  }

  toggleLantern() {
    this.lanternOn = !this.lanternOn;
    if (this.lanternLight) this.lanternLight.intensity = this.lanternOn ? 1.0 : 0.15;
    this.cabinGroup?.traverse((c) => {
      if (c.userData?.interactId === "lantern" && c.children[0]?.material?.emissive) {
        c.children[0].material.emissiveIntensity = this.lanternOn ? 0.8 : 0.05;
      }
    });
    return this.lanternOn ? "Lantern lit" : "Lantern dimmed";
  }

  toggleFireplace() {
    this.fireplaceOn = !this.fireplaceOn;
    if (this.fireplaceLight) this.fireplaceLight.intensity = this.fireplaceOn ? 0.7 : 0.05;
    const ember = this.cabinGroup?.getObjectByName("fireplaceEmber");
    if (ember?.material) ember.material.opacity = this.fireplaceOn ? 0.85 : 0.1;
    return this.fireplaceOn ? "Fireplace crackling" : "Fireplace out";
  }

  buildOutdoorCamp() {
    const assets = getAssets();
    const { x: cx, z: cz } = CAMP_ORIGIN;

    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.4, 4), fabricMat(0xe85a4f));
    tent.position.set(cx + 5.5, 1.2, cz + 2);
    tent.rotation.y = Math.PI / 6;
    tent.castShadow = true;
    this.group.add(tent);

    const fireGroup = new THREE.Group();
    const logsGltf = assets?.kenney?.campfire_logs || assets?.kenney?.log_stack;
    if (logsGltf) {
      fireGroup.add(cloneModel(logsGltf, { scale: 2.5, rotationY: 0 }));
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
      pile.position.set(cx - 4.5, 0, cz + 3.5);
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
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.08), woodMat(0x9a7048));
    sign.position.set(DOCK_SHORE.x + 0.5, 1.5, DOCK_SHORE.z + 0.6);
    this.group.add(sign);

    const cabinSign = sign.clone();
    cabinSign.position.set(CAMP_ORIGIN.x, 2.4, CAMP_ORIGIN.z - CABIN_SIZE.depth / 2 - 1.4);
    cabinSign.scale.set(1.3, 0.9, 1);
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
    this.interiorLights.forEach((l, i) => {
      if (l === this.lanternLight) return;
      if (l === this.fireplaceLight) return;
      l.intensity = (i === 0 ? 0.4 : 0.35) + lightBoost * 0.15;
    });
  }
}
