import * as THREE from "three";
import { ZONES, shouldShowBoat } from "./data.js";
import { getAssets, cloneModel, updateModelAnimations, groundAlign } from "./asset-loader.js";
import { Campground, isClearOfCampground } from "./campground.js";
import {
  DOCK_GROUP,
  DOCK_SHORE_LOCAL_Z,
  DOCK_BRIDGE_LOCAL_Z,
  DOCK_STAIRS_LOCAL_Z,
  registerDockWalkCollisions,
  isOnDockStairs,
  isOnDockWalk,
  isOnPierWalk,
  isOnPierCorridor,
  isOnShoreDeck,
  getDockStairEyeHeightFallback,
  DOCK_STAIRS,
  DOCK_WALK,
  DOCK_SHORE_DECK,
  DOCK_EYE_OFFSET,
  DOCK_FEET_OFFSET,
  DOCK_PIER_FEET_OFFSET,
  DOCK_PIER_MIN_SURFACE_Y,
  DOCK_PIER_SURFACE_Y,
} from "./dock-layout.js";
import { CollisionSystem } from "./collisions.js";

/** Keep shore props out of active fishing pools and cast approach lanes. */
function isNearFishingPool(x, z, margin = 16) {
  return Object.values(ZONES).some((zone) => {
    const dx = x - zone.castCenter.x;
    const dz = z - zone.castCenter.z;
    return Math.hypot(dx, dz) < zone.castRadius + margin;
  });
}

const WATER_VERT = `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWave;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float wx = pos.x * 0.12;
    float wz = pos.z * 0.1;
    float wave = sin(wx + uTime * 2.2) * 0.22
               + sin(wz * 1.3 - uTime * 1.7) * 0.16
               + sin((wx + wz) * 0.85 + uTime * 1.1) * 0.1
               + sin(wx * 2.8 - uTime * 3.0) * 0.05
               + sin(wz * 3.2 + uTime * 2.4) * 0.04;
    pos.y += wave;
    vWave = wave;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const WATER_FRAG = `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSunDir;
  uniform samplerCube uEnvMap;
  uniform vec3 uCameraPos;
  uniform float uUseEnv;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vWave;

  void main() {
    vec2 p = vWorldPos.xz * 0.12;
    float w = sin(p.x * 0.6 + uTime * 2.0) * 0.5
            + sin(p.y * 0.5 - uTime * 1.6) * 0.45
            + sin((p.x + p.y) * 0.35 + uTime * 1.3) * 0.3;
    vec3 normal = normalize(vec3(0.0, 1.0, vWave * 2.0));
    float fresnel = pow(1.0 - max(dot(normal, normalize(vec3(0.0, 1.0, 0.3))), 0.0), 2.5);
    vec3 col = mix(uShallowColor, uDeepColor, fresnel * 0.55 + 0.25);
    col += vec3(0.2, 0.28, 0.35) * w * 0.12;
    col += vec3(0.85, 0.92, 1.0) * pow(max(dot(reflect(uSunDir, normal), vec3(0.0,1.0,0.0)), 0.0), 48.0) * 0.45;
    if (uUseEnv > 0.5) {
      vec3 viewDir = normalize(vWorldPos - uCameraPos);
      vec3 reflectDir = reflect(viewDir, normal);
      vec3 envRef = texture(uEnvMap, reflectDir).rgb;
      col = mix(col, envRef, fresnel * 0.42);
    }
    float foam = smoothstep(0.08, 0.14, vWave) * 0.15;
    col += vec3(foam);
    gl_FragColor = vec4(col, 0.72);
  }
`;

export class LakeEnvironment {
  static createDummyEnvMap() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#8ab0c8";
    ctx.fillRect(0, 0, 2, 2);
    const faces = [canvas, canvas, canvas, canvas, canvas, canvas];
    const cube = new THREE.CubeTexture(faces);
    cube.needsUpdate = true;
    return cube;
  }

  constructor(scene, envMaps = null) {
    this.scene = scene;
    this.envMaps = envMaps;
    this.waterUniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x07506e) },
      uShallowColor: { value: new THREE.Color(0x1a9ab8) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uEnvMap: { value: envMaps?.envMap || LakeEnvironment.createDummyEnvMap() },
      uCameraPos: { value: new THREE.Vector3() },
      uUseEnv: { value: envMaps?.envMap ? 1 : 0 },
    };
    this.zoneMarkers = [];
    this.ambientFish = [];
    this.waterMesh = null;
    this.zoneDressing = {};
    this.currentZoneId = "Lake Dock";
    this.qualityMode = "high";
    this.collisions = new CollisionSystem();
    this.dockStairsMeshes = [];
    this.dockWalkMeshes = [];
    this.pierHeightMeshes = [];
    this.mooringBoat = null;
    this.deepWaterBoat = null;
    this._stairRaycaster = new THREE.Raycaster();
    this._stairRayOrigin = new THREE.Vector3();
    this._stairRayDir = new THREE.Vector3(0, -1, 0);
    this._dockEyeCache = { x: NaN, z: NaN, y: null };
    this.build();
  }

  build() {
    if (this.envMaps?.background) {
      this.scene.background = this.envMaps.background;
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.scene.environment = this.envMaps.envMap;
      this.scene.fog = new THREE.Fog(0x8ab0a8, 48, 150);
    } else {
      this.scene.fog = new THREE.Fog(0x8ec4d8, 48, 150);
      this.scene.background = new THREE.Color(0xc9edf9);
    }

    const hemi = new THREE.HemisphereLight(0xc9edf9, 0x3a6a5a, this.envMaps ? 0.45 : 0.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4d6, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);
    this.sun = sun;

    this.buildGround();
    this.buildWater();
    this.buildDock();
    this.buildTrees();
    this.buildMountains();
    this.buildShoreDetails();
    this.buildLakeScatter();
    this.buildZoneMarkers();
    this.buildFishingPoolMarkers();
    this.campground = new Campground(this.scene, this.collisions);
    this.campFire = this.campground.campFire;
    this.buildZoneDressing();
    this.buildDockCollisions();
    this.buildEnvironmentCollisions();
    this.buildPierWalkVolumes();
    this.spawnAmbientFish();
  }

  /** Invisible tread planes for reliable pier height (merged GLB meshes break raycasts). */
  buildPierWalkVolumes() {
    const mat = new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false });
    const cx = DOCK_GROUP.x;
    const add = (y, cz, halfW, halfD) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.03, halfD * 2), mat);
      mesh.position.set(cx, y, cz);
      mesh.userData.walkSurface = true;
      this.scene.add(mesh);
      this.pierHeightMeshes.push(mesh);
    };
    // Lake-end wide platform (world z ~0.4–4.8)
    add(DOCK_PIER_SURFACE_Y, 2.6, 1.45, 2.2);
    // Main pier span through bridge (world z ~4.8–12)
    add(DOCK_PIER_SURFACE_Y, 7.7, 1.35, 4.2);
  }

  buildDockCollisions() {
    registerDockWalkCollisions(this.collisions);
    const c = this.collisions;
    const dx = DOCK_GROUP.x;
    const dz = DOCK_GROUP.z;
    // Side berms flanking the shore deck
    c.addBoxCenter(dx - 4.3, dz + DOCK_SHORE_LOCAL_Z + 1.6, 1.7, 2.4);
    c.addBoxCenter(dx + 4.3, dz + DOCK_SHORE_LOCAL_Z + 1.6, 1.7, 2.4);
    // Mooring skiff
    c.addCircle(dx + 2.55, dz + 0.35, 1.1);
    // Dock bench, crate, log stack
    c.addBoxCenter(dx + 1.55, dz + 2.5, 0.75, 0.35);
    c.addBoxCenter(dx + 1.55, dz + 9.2, 0.35, 0.35);
    c.addCircle(dx - 1.85, dz + 9.4, 0.55);
    // Pier rail posts
    for (const z of [0.5, 5.5, 9.5]) {
      c.addCircle(dx - 1.55, dz + z, 0.35);
      c.addCircle(dx + 1.55, dz + z, 0.35);
    }
  }

  buildEnvironmentCollisions() {
    const c = this.collisions;
    // Dock zone sign (off the walkable center line).
    c.addCircle(2.2, 11.5, 0.45);
    // North Cove rocks.
    for (const [x, z] of [
      [-22, -8], [-14, -12], [-24, -16], [-12, -18], [-20, -22],
    ]) {
      c.addCircle(x, z, 2.4);
    }
    // Deep water buoy / boat.
    c.addCircle(26, -20, 1.8);
    // North Cove bushes.
    for (const [x, z] of [[-16, -8], [-20, -10], [-14, -12]]) {
      c.addCircle(x, z, 1.0);
    }
    // Moonlit Cove rocks and pier
    for (const [x, z, r] of [[-14, -30, 1.6], [-2, -42, 1.4], [-10, -44, 1.5]]) {
      c.addCircle(x, z, r);
    }
    c.addBoxCenter(-8, -26, 1.2, 0.45);
    // Lake Dock barrel and sign
    c.addCircle(-2.5, 10.5, 0.45);
  }

  resolveCollisions(position) {
    return this.collisions.resolve(position);
  }

  buildZoneDressing() {
    this.buildDockZoneExtras();
    this.buildCoveZoneExtras();
    this.buildDeepWaterExtras();
    this.buildMoonlitCoveExtras();
  }

  buildDockZoneExtras() {
    const group = new THREE.Group();
    group.name = "Lake Dock";
    const assets = getAssets();
    const bushGltf = assets?.kenney?.plant_bushSmall;
    if (bushGltf) {
      [[-3, 10], [4, 9], [-6, 8]].forEach(([x, z], i) => {
        if (isNearFishingPool(x, z, 10)) return;
        const bush = cloneModel(bushGltf, { scale: 1.8 + i * 0.2, rotationY: i });
        bush.position.set(x, 0, z);
        groundAlign(bush, 0.02);
        group.add(bush);
      });
    }
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4), new THREE.MeshStandardMaterial({ color: 0x6a4a28 }));
    signPost.position.set(2.2, 0.7, 11.5);
    group.add(signPost);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x8b5a34 })
    );
    sign.position.set(2.2, 1.35, 11.5);
    group.add(sign);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.42, 10), new THREE.MeshStandardMaterial({
      color: 0x5a4030, roughness: 0.85,
    }));
    barrel.position.set(-2.5, 0.21, 10.5);
    group.add(barrel);
    group.visible = true;
    this.scene.add(group);
    this.zoneDressing["Lake Dock"] = group;
  }

  buildCoveZoneExtras() {
    const group = new THREE.Group();
    group.name = "North Cove";
    const assets = getAssets();
    const rockKeys = ["rock_largeA", "rock_largeB", "rock_tallA", "rock_smallA", "rock_smallB"];
    const rockPositions = [
      [-22, -8], [-14, -12], [-24, -16], [-12, -18], [-20, -22],
    ];
    rockPositions.forEach(([x, z], i) => {
      const key = rockKeys[i % rockKeys.length];
      const gltf = assets?.kenney?.[key] || assets?.env?.[`Rock_${(i % 3) + 1}`];
      if (gltf) {
        const rock = cloneModel(gltf, { scale: 2.8 + Math.random() * 1.2, rotationY: Math.random() * Math.PI });
        rock.position.set(x, 0, z);
        groundAlign(rock, 0.02);
        group.add(rock);
      } else {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1, 0),
          new THREE.MeshStandardMaterial({ color: 0x6a6a6a, flatShading: true })
        );
        rock.position.set(x, 0.35, z);
        group.add(rock);
      }
    });
    const bushGltf = assets?.kenney?.plant_bushLarge;
    if (bushGltf) {
      [-16, -20, -14].forEach((x, i) => {
        const bush = cloneModel(bushGltf, { scale: 2.2 + i * 0.2, rotationY: i });
        bush.position.set(x, 0, -6 - i * 2);
        groundAlign(bush, 0.02);
        group.add(bush);
      });
    }
    const pierGltf = assets?.env?.Dock_Long_NoRope || assets?.env?.Dock_Long;
    if (pierGltf) {
      const pier = cloneModel(pierGltf, { scale: 0.35, rotationY: 0 });
      pier.position.set(-18, 0, -4);
      groundAlign(pier, 0.02);
      group.add(pier);
    }
    group.visible = false;
    this.scene.add(group);
    this.zoneDressing["North Cove"] = group;
  }

  buildDeepWaterExtras() {
    const group = new THREE.Group();
    group.name = "Deep Water";
    const assets = getAssets();
    const boatGltf = assets?.env?.Boat;
    if (boatGltf) {
      const buoy = cloneModel(boatGltf, { scale: 0.45, rotationY: 0 });
      buoy.name = "DeepWaterBoat";
      buoy.position.set(26, 0, -20);
      groundAlign(buoy, 0.04);
      buoy.visible = false;
      group.add(buoy);
      this.deepWaterBoat = buoy;
    } else {
      const buoy = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.4, 0.9, 12),
        new THREE.MeshStandardMaterial({ color: 0xcc2222 })
      );
      buoy.position.set(26, 0.5, -20);
      group.add(buoy);
    }
    const dropMat = new THREE.MeshStandardMaterial({ color: 0x043a52, transparent: true, opacity: 0.55 });
    const drop = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), dropMat);
    drop.rotation.x = -Math.PI / 2;
    drop.position.set(22, -0.12, -32);
    group.add(drop);
    group.visible = false;
    this.scene.add(group);
    this.zoneDressing["Deep Water"] = group;
  }

  buildMoonlitCoveExtras() {
    const group = new THREE.Group();
    group.name = "Moonlit Cove";
    const assets = getAssets();
    const lilyGltf = assets?.kenney?.lily_small;
    if (lilyGltf) {
      [[-4, -32], [-12, -36], [-6, -40], [2, -34]].forEach(([x, z], i) => {
        const lily = cloneModel(lilyGltf, { scale: 1.4 + i * 0.15, rotationY: i * 0.7 });
        lily.position.set(x, 0, z);
        groundAlign(lily, 0.01);
        group.add(lily);
      });
    }
    const rockKeys = ["rock_smallA", "rock_smallB", "rock_tallA"];
    [[-14, -30], [-2, -42], [-10, -44]].forEach(([x, z], i) => {
      const gltf = assets?.kenney?.[rockKeys[i % rockKeys.length]];
      if (gltf) {
        const rock = cloneModel(gltf, { scale: 1.8 + i * 0.3, rotationY: i * 1.1 });
        rock.position.set(x, 0, z);
        groundAlign(rock, 0.02);
        group.add(rock);
      }
    });
    const pierGltf = assets?.env?.Dock_Stairs || assets?.env?.Dock_Long_NoRope;
    if (pierGltf) {
      const pier = cloneModel(pierGltf, { scale: 0.28, rotationY: Math.PI * 0.15 });
      pier.position.set(-8, 0, -26);
      groundAlign(pier, 0.02);
      group.add(pier);
    }
    const moonGlow = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x8899cc, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    moonGlow.rotation.x = -Math.PI / 2;
    moonGlow.position.set(-8, 0.04, -38);
    group.add(moonGlow);
    group.visible = false;
    this.scene.add(group);
    this.zoneDressing["Moonlit Cove"] = group;
  }

  buildGround() {
    const mat = this.envMaps?.groundDiff
      ? new THREE.MeshStandardMaterial({
          map: this.envMaps.groundDiff,
          normalMap: this.envMaps.groundNor,
          normalScale: new THREE.Vector2(0.22, 0.22),
          roughness: 0.92,
          metalness: 0.02,
        })
      : new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.groundMesh = ground;
    this.scene.add(ground);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(120, 120, 128, 128);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0;
    this.waterMesh.renderOrder = 8;
    this.scene.add(this.waterMesh);
  }

  buildDock() {
    const assets = getAssets();
    const dockGroup = new THREE.Group();
    dockGroup.name = "Dock";
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a34, roughness: 0.85 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 0.82 });
    const longGltf = assets?.env?.Dock_Long_NoRope || assets?.env?.Dock_Long;

    const addWalkSurface = (root) => {
      root.traverse((child) => {
        if (child.isMesh) this.dockWalkMeshes.push(child);
      });
    };

    const dockGltf = assets?.env?.Dock_Wide;
    if (dockGltf) {
      const dock = cloneModel(dockGltf, { scale: 0.4, rotationY: Math.PI });
      dock.position.set(0, 0, -1.8);
      groundAlign(dock, 0.02);
      dockGroup.add(dock);
      addWalkSurface(dock);
    } else {
      for (let i = 0; i < 12; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.5), woodMat);
        plank.position.set(0, 0.15, -i * 0.55);
        dockGroup.add(plank);
        addWalkSurface(plank);
      }
    }

    if (longGltf) {
      const seg = cloneModel(longGltf, { scale: 0.4, rotationY: 0 });
      seg.position.set(0, 0, DOCK_BRIDGE_LOCAL_Z);
      groundAlign(seg, 0.06);
      dockGroup.add(seg);
      addWalkSurface(seg);
    } else {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.1), woodMat);
      plank.position.set(0, 0.12, DOCK_BRIDGE_LOCAL_Z);
      dockGroup.add(plank);
      addWalkSurface(plank);
    }

    const stairsGltf = assets?.env?.Dock_Stairs;
    if (stairsGltf) {
      const stairs = cloneModel(stairsGltf, { scale: 0.38, rotationY: 0 });
      stairs.position.set(0, 0, DOCK_STAIRS_LOCAL_Z);
      groundAlign(stairs, 0.04);
      dockGroup.add(stairs);
      addWalkSurface(stairs);
      stairs.traverse((child) => {
        if (child.isMesh) this.dockStairsMeshes.push(child);
      });
    } else {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.4), woodMat);
      ramp.position.set(0, 0.16, DOCK_STAIRS_LOCAL_Z - 0.6);
      ramp.rotation.x = -0.14;
      dockGroup.add(ramp);
      addWalkSurface(ramp);
    }

    const shoreDeck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 3.6), plankMat);
    shoreDeck.position.set(0, 0.1, DOCK_SHORE_LOCAL_Z);
    shoreDeck.receiveShadow = true;
    dockGroup.add(shoreDeck);
    addWalkSurface(shoreDeck);

    const bermMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.95 });
    const bermW = 3.4;
    const bermD = 4.8;
    for (const side of [-1, 1]) {
      const berm = new THREE.Mesh(new THREE.BoxGeometry(bermW, 0.2, bermD), bermMat);
      berm.position.set(side * 4.3, 0.06, DOCK_SHORE_LOCAL_Z + 1.6);
      berm.receiveShadow = true;
      dockGroup.add(berm);
    }

    const boatGltf = assets?.env?.Boat;
    if (boatGltf) {
      const moor = cloneModel(boatGltf, { scale: 0.42, rotationY: Math.PI * 0.62 });
      moor.name = "MooringBoat";
      moor.position.set(2.55, 0, 0.35);
      groundAlign(moor, 0.06);
      moor.visible = false;
      dockGroup.add(moor);
      this.mooringBoat = moor;
    }

    dockGroup.position.set(DOCK_GROUP.x, 0, DOCK_GROUP.z);
    this.scene.add(dockGroup);
    this.dockGroup = dockGroup;
    this.buildDockAccessories(dockGroup, woodMat, plankMat);
  }

  buildDockAccessories(dockGroup, woodMat, plankMat) {
    const assets = getAssets();
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.4), plankMat);
    bench.position.set(1.55, 0.55, 2.5);
    dockGroup.add(bench);
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.06), woodMat);
    benchBack.position.set(1.55, 0.78, 2.32);
    dockGroup.add(benchBack);

    for (const z of [0.5, 5.5, 9.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 8), woodMat);
      post.position.set(-1.55, 0.55, z);
      dockGroup.add(post);
      const postR = post.clone();
      postR.position.x = 1.55;
      dockGroup.add(postR);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.06, 0.06), woodMat);
      rail.position.set(0, 0.95, z);
      dockGroup.add(rail);
    }

    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 10), new THREE.MeshStandardMaterial({
      color: 0x6a7078, roughness: 0.4, metalness: 0.6,
    }));
    bucket.position.set(-1.55, 0.12, 1.2);
    dockGroup.add(bucket);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.38, 0.45), woodMat);
    crate.position.set(1.55, 0.19, 9.2);
    dockGroup.add(crate);

    const logGltf = assets?.kenney?.log_stack;
    if (logGltf) {
      const logs = cloneModel(logGltf, { scale: 1.4, rotationY: 0.3 });
      logs.position.set(-1.85, 0, 9.4);
      groundAlign(logs, 0.02);
      dockGroup.add(logs);
    }

    for (let i = 0; i < 6; i++) {
      const rope = new THREE.Mesh(
        new THREE.TorusGeometry(0.18 + i * 0.02, 0.012, 6, 16, Math.PI * 1.4),
        new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.9 })
      );
      rope.rotation.x = Math.PI / 2;
      rope.rotation.z = i * 0.4;
      rope.position.set(1.45, 0.35 + i * 0.08, 3.5 + i * 0.15);
      dockGroup.add(rope);
    }
  }

  buildShoreDetails() {
    const assets = getAssets();
    const shoreMat = new THREE.MeshStandardMaterial({ color: 0xc4a878, roughness: 0.95 });
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x8a8078, roughness: 0.9 });

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 1.4 - Math.PI * 0.2;
      const radius = 30 + (i % 4) * 1.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.55 - 8;
      if (isNearFishingPool(x, z, 8)) continue;
      const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.06, 6, 5), pebbleMat);
      pebble.scale.y = 0.45;
      pebble.position.set(x, 0.04, z);
      pebble.rotation.y = i * 0.7;
      this.scene.add(pebble);
    }

    const sandPatch = new THREE.Mesh(new THREE.CircleGeometry(14, 32), shoreMat);
    sandPatch.rotation.x = -Math.PI / 2;
    sandPatch.position.set(2, 0.015, 14);
    this.scene.add(sandPatch);

    const rockKeys = ["rock_smallA", "rock_smallB", "rock_largeA"];
    const shoreRocks = [
      [4, 13], [-5, 12], [8, 11], [-8, 14], [12, 8], [-12, 10], [6, 16], [-3, 17],
    ];
    shoreRocks.forEach(([x, z], i) => {
      if (!isClearOfCampground(x, z, 2.5)) return;
      if (isNearFishingPool(x, z, 10)) return;
      const gltf = assets?.kenney?.[rockKeys[i % rockKeys.length]];
      if (gltf) {
        const rock = cloneModel(gltf, { scale: 1.6 + (i % 3) * 0.4, rotationY: i * 0.8 });
        rock.position.set(x, 0, z);
        groundAlign(rock, 0.02);
        this.scene.add(rock);
        this.collisions.addCircle(x, z, 1.1);
      }
    });

    const logGltf = assets?.kenney?.log || assets?.kenney?.campfire_logs;
    if (logGltf) {
      [[3, 12.5], [-6, 13.5], [9, 15]].forEach(([x, z], i) => {
        if (!isClearOfCampground(x, z, 2)) return;
        if (isNearFishingPool(x, z, 10)) return;
        const log = cloneModel(logGltf, { scale: 1.5 + i * 0.2, rotationY: i * 1.1 });
        log.position.set(x, 0, z);
        groundAlign(log, 0.02);
        this.scene.add(log);
      });
    }

    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const x = -10 + (i % 4) * 6.5;
      const z = 12 + Math.floor(i / 4) * 2.2;
      if (isNearFishingPool(x, z, 10)) continue;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55 + (i % 4) * 0.12, 5), reedMat);
      reed.position.set(x, 0.28, z);
      reed.rotation.z = (i % 3 - 1) * 0.12;
      this.scene.add(reed);
      if (i % 3 === 0) {
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), reedMat);
        tuft.scale.set(1.4, 2.2, 1.4);
        tuft.position.set(x, 0.58, z);
        this.scene.add(tuft);
      }
    }
  }

  buildLakeScatter() {
    const assets = getAssets();
    const extraTrees = [
      [-10, 8], [18, 12], [-20, 14], [24, 6], [-14, 16], [11, 18],
    ];
    extraTrees.forEach(([x, z], i) => {
      if (!isClearOfCampground(x, z, 8)) return;
      if (isNearFishingPool(x, z, 12)) return;
      const key = ["tree_thin", "tree_cone", "tree_detailed"][i % 3];
      const gltf = assets?.kenney?.[key];
      if (!gltf) return;
      const tree = cloneModel(gltf, { scale: 2.8 + (i % 2) * 0.6, rotationY: i * 1.3 });
      tree.position.set(x, 0, z);
      groundAlign(tree, 0);
      this.scene.add(tree);
      this.collisions.addCircle(x, z, 1.0);
    });

    const grassBush = [
      [-2, 9], [7, 7], [-11, 4], [14, 3], [5, 14], [-7, 11], [16, 10], [-15, 8],
    ];
    grassBush.forEach(([x, z], i) => {
      if (!isClearOfCampground(x, z, 2.5)) return;
      if (isNearFishingPool(x, z, 12)) return;
      const gltf = i % 2 === 0 ? assets?.kenney?.grass : assets?.kenney?.plant_bushSmall;
      if (!gltf) return;
      const prop = cloneModel(gltf, { scale: 1.8 + (i % 3) * 0.4, rotationY: i * 0.7 });
      prop.position.set(x, 0, z);
      groundAlign(prop, 0.02);
      this.scene.add(prop);
      if (i % 2 === 1) this.collisions.addCircle(x, z, 0.65);
    });
  }

  buildTrees() {
    const assets = getAssets();
    const treeSources = [
      { cat: "kenney", keys: ["tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree_thin"] },
      { cat: "env", keys: ["BirchTree_1", "BirchTree_2", "BirchTree_3"] },
    ];
    const positions = [
      [10, 12], [14, 6], [-16, -4], [18, -2],
      [8, 18], [20, 8], [16, 14], [-24, 6], [22, 16], [-18, -8],
    ];

    positions.forEach(([x, z], i) => {
      const useKenney = i % 2 === 0;
      const treeRadius = useKenney ? 9 : 3.5;
      if (!isClearOfCampground(x, z, treeRadius)) return;
      if (isNearFishingPool(x, z, 14)) return;
      const source = useKenney ? treeSources[0] : treeSources[1];
      const key = source.keys[i % source.keys.length];
      const gltf = assets?.[source.cat]?.[key];
      if (gltf) {
        const scale = useKenney
          ? 3.2 + Math.random() * 1.2
          : 0.55 + Math.random() * 0.25;
        const tree = cloneModel(gltf, { scale, rotationY: Math.random() * Math.PI * 2 });
        tree.position.set(x, 0, z);
        groundAlign(tree, 0);
        this.scene.add(tree);
        this.collisions.addCircle(x, z, useKenney ? 1.35 + scale * 0.14 : 0.85);
      } else {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6b3a });
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 2.5), trunkMat);
        trunk.position.y = 1.25;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 8), leafMat);
        leaves.position.y = 4;
        tree.add(trunk, leaves);
        tree.position.set(x, 0, z);
        this.scene.add(tree);
        this.collisions.addCircle(x, z, 1.1);
      }
    });

    const grassGltf = assets?.kenney?.grass;
    const bushGltf = assets?.kenney?.plant_bushSmall;
    const scatter = [
      [-4, 11], [5, 10], [-10, 5], [12, 4], [-18, 2], [15, -1], [0, 12], [-8, 6],
    ];
    scatter.forEach(([x, z], i) => {
      if (!isClearOfCampground(x, z, 2.5)) return;
      if (isNearFishingPool(x, z, 12)) return;
      const gltf = i % 2 === 0 ? grassGltf : bushGltf;
      if (!gltf) return;
      const prop = cloneModel(gltf, { scale: 2.0 + Math.random() * 0.8, rotationY: Math.random() * Math.PI });
      prop.position.set(x, 0, z);
      groundAlign(prop, 0.02);
      this.scene.add(prop);
      if (gltf === bushGltf) {
        this.collisions.addCircle(x, z, 0.55);
      }
    });
  }

  buildMountains() {
    const assets = getAssets();
    const rockKeys = ["rock_tallA", "rock_largeA", "rock_largeB", "rock_tallA"];
    const peaks = [
      { x: -40, z: -50, s: 3.5 },
      { x: -20, z: -55, s: 2.8 },
      { x: 10, z: -58, s: 4.0 },
      { x: 35, z: -48, s: 3.2 },
    ];
    peaks.forEach(({ x, z, s }, i) => {
      const key = rockKeys[i % rockKeys.length];
      const gltf = assets?.kenney?.[key];
      if (gltf) {
        const rock = cloneModel(gltf, { scale: s, rotationY: i * 0.8 });
        rock.position.set(x, 0, z);
        groundAlign(rock, 0);
        this.scene.add(rock);
      } else {
        const mat = new THREE.MeshStandardMaterial({ color: 0x6a8a9a, flatShading: true });
        const m = new THREE.Mesh(new THREE.ConeGeometry(s * 5, s * 6, 6), mat);
        m.position.set(x, s * 2, z);
        this.scene.add(m);
      }
    });
  }

  buildZoneMarkers() {
    Object.values(ZONES).forEach((zone) => {
      const group = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.4, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd37a, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x0d4f73, emissive: 0x0d4f73, emissiveIntensity: 0.4 })
      );
      pillar.position.y = 1.1;
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 0.06, 24),
        new THREE.MeshStandardMaterial({ color: 0x0d4f73, transparent: true, opacity: 0.35 })
      );
      pad.rotation.x = Math.PI / 2;
      pad.position.y = 0.03;
      group.add(ring, pillar, pad);
      group.position.set(zone.teleport.x, 0, zone.teleport.z);
      group.userData.zoneId = zone.id;
      group.userData.zoneLabel = zone.label;
      this.scene.add(group);
      this.zoneMarkers.push(group);
    });
  }

  buildFishingPoolMarkers() {
    this.fishingPoolMarkers = {};
    Object.values(ZONES).forEach((zone) => {
      const group = new THREE.Group();
      group.name = `FishingPool-${zone.id}`;

      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(zone.castRadius, 72),
        new THREE.MeshBasicMaterial({
          color: 0x5ad4f0,
          transparent: true,
          opacity: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(zone.castCenter.x, 0.055, zone.castCenter.z);
      fill.userData.poolY = { x: zone.castCenter.x, z: zone.castCenter.z, base: 0.055 };
      fill.renderOrder = 2;
      group.add(fill);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(zone.castRadius - 0.18, zone.castRadius, 72),
        new THREE.MeshBasicMaterial({
          color: 0x9ae8ff,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zone.castCenter.x, 0.065, zone.castCenter.z);
      ring.userData.poolY = { x: zone.castCenter.x, z: zone.castCenter.z, base: 0.065 };
      ring.renderOrder = 3;
      group.add(ring);

      const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.55, 32),
        new THREE.MeshBasicMaterial({
          color: 0x7ee8ff,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      innerRing.rotation.x = -Math.PI / 2;
      innerRing.position.set(zone.castCenter.x, 0.06, zone.castCenter.z);
      innerRing.userData.poolY = { x: zone.castCenter.x, z: zone.castCenter.z, base: 0.06 };
      innerRing.renderOrder = 3;
      group.add(innerRing);

      group.visible = false;
      this.scene.add(group);
      this.fishingPoolMarkers[zone.id] = group;
    });
  }

  spawnAmbientFish() {
    const assets = getAssets();
    const fishKeys = [
      "Clownfish", "Goldfish", "Betta", "Tuna", "ButterflyFish", "CardinalFish",
      "BlueTang", "Tetra", "MoorishIdol", "RoyalGramma", "YellowTang", "ZebraClownFish",
    ];
    for (let i = 0; i < 16; i++) {
      const key = fishKeys[i % fishKeys.length];
      const gltf = assets?.fish?.[key];
      let fish;
      if (gltf) {
        fish = cloneModel(gltf, { scale: 0.25, rotationY: -Math.PI / 2, animate: true });
      } else {
        fish = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a90c4, transparent: true, opacity: 0.55 })
        );
        body.scale.set(2, 0.6, 0.8);
        fish.add(body);
      }
      fish.position.set(
        (Math.random() - 0.5) * 60,
        -0.15 - Math.random() * 0.4,
        -10 - Math.random() * 40
      );
      fish.userData = {
        speed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        radius: 2 + Math.random() * 4,
        origin: fish.position.clone(),
      };
      this.scene.add(fish);
      this.ambientFish.push(fish);
    }
  }

  applyZone(zoneId) {
    const zone = ZONES[zoneId];
    if (!zone) return;
    this.currentZoneId = zoneId;
    if (!this.envMaps) {
      this.scene.background.setHex(zone.skyTint);
    }
    this.scene.fog.color.setHex(zone.fogColor);
    this.applyFogForQuality(zone);
    this.waterUniforms.uDeepColor.value.setHSL(0.55, 0.5, 0.25 + zone.depth * 0.15);
    this.waterUniforms.uShallowColor.value.setHSL(0.52, 0.55, 0.45 + zone.depth * 0.1);
    Object.entries(this.zoneDressing).forEach(([id, group]) => {
      group.visible = id === zoneId;
    });
    if (this.dockGroup) this.dockGroup.visible = zoneId === "Lake Dock";
    if (this.campground?.group) this.campground.group.visible = zoneId === "Lake Dock";
    if (this.fishingPoolMarkers) {
      Object.entries(this.fishingPoolMarkers).forEach(([id, group]) => {
        group.visible = id === zoneId;
      });
    }
  }

  updateBoatForLevel(boatLevel) {
    const show = shouldShowBoat(boatLevel);
    if (this.mooringBoat) this.mooringBoat.visible = show;
    if (this.deepWaterBoat) this.deepWaterBoat.visible = show;
  }

  getMooringBoatPosition(out = new THREE.Vector3()) {
    if (!this.mooringBoat?.visible) return null;
    return this.mooringBoat.getWorldPosition(out);
  }

  isNearMooringBoat(x, z, radius = 2.8) {
    const pos = this.getMooringBoatPosition();
    if (!pos) return false;
    const dx = x - pos.x;
    const dz = z - pos.z;
    return dx * dx + dz * dz <= radius * radius;
  }

  setZoneMarkersVisible(visible) {
    this.zoneMarkers?.forEach((group) => {
      group.visible = visible;
    });
  }

  setEnvironmentMaps(envMaps) {
    this.envMaps = envMaps;
    if (!envMaps) return;
    if (envMaps.background) {
      this.scene.background = envMaps.background;
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
    }
    if (envMaps.envMap) {
      this.scene.environment = envMaps.envMap;
      this.waterUniforms.uEnvMap.value = envMaps.envMap;
      this.waterUniforms.uUseEnv.value = 1;
    }
    if (envMaps.groundDiff && this.groundMesh?.material) {
      this.groundMesh.material.map = envMaps.groundDiff;
      this.groundMesh.material.normalMap = envMaps.groundNor;
      this.groundMesh.material.needsUpdate = true;
    }
  }

  setQuality(quality) {
    this.qualityMode = quality || "high";
    const low = quality === "low";
    const quest = quality === "quest";
    const segs = low || quest ? 48 : 128;
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.waterMesh.geometry = new THREE.PlaneGeometry(120, 120, segs, segs);
    }
    if (this.sun) this.sun.castShadow = !low && !quest;
    this.ambientFish.forEach((fish, i) => {
      if (quest) fish.visible = i < 8;
      else if (low) fish.visible = i % 2 === 0;
      else fish.visible = true;
    });
    if (this.currentZoneId) {
      const zone = ZONES[this.currentZoneId];
      if (zone) this.applyFogForQuality(zone);
    }
  }

  applyFogForQuality(zone) {
    if (!this.scene?.fog || !zone) return;
    const quest = this.qualityMode === "quest";
    this.scene.fog.near = quest ? zone.fogNear * 0.9 : zone.fogNear;
    this.scene.fog.far = quest ? Math.min(zone.fogFar, 100) : zone.fogFar;
  }

  update(time, dt = 0.016, camera = null) {
    this.waterUniforms.uTime.value = time;
    if (camera) this.waterUniforms.uCameraPos.value.copy(camera.position);
    if (this.sun) {
      this.waterUniforms.uSunDir.value.copy(this.sun.position).normalize();
    }
    if (this.fishingPoolMarkers) {
      Object.values(this.fishingPoolMarkers).forEach((group) => {
        if (!group.visible) return;
        group.traverse((child) => {
          const py = child.userData?.poolY;
          if (!py) return;
          child.position.y = py.base + this.getWaterHeight(py.x, py.z, time);
        });
      });
    }
    this.ambientFish.forEach((fish) => {
      const d = fish.userData;
      fish.position.x = d.origin.x + Math.sin(time * d.speed + d.phase) * d.radius;
      fish.position.z = d.origin.z + Math.cos(time * d.speed * 0.7 + d.phase) * d.radius * 0.5;
      fish.rotation.y = Math.atan2(
        Math.cos(time * d.speed + d.phase),
        -Math.sin(time * d.speed * 0.7 + d.phase)
      );
      updateModelAnimations(fish, dt);
    });
    this.zoneMarkers.forEach((m, i) => {
      m.children[0].material.opacity = 0.5 + Math.sin(time * 2 + i) * 0.2;
    });
  }

  getWaterHeight(x, z, time) {
    const wx = x * 0.12;
    const wz = z * 0.1;
    return (
      Math.sin(wx + time * 2.2) * 0.22 +
      Math.sin(wz * 1.3 - time * 1.7) * 0.16 +
      Math.sin((wx + wz) * 0.85 + time * 1.1) * 0.1 +
      Math.sin(wx * 2.8 - time * 3.0) * 0.05 +
      Math.sin(wz * 3.2 + time * 2.4) * 0.04
    );
  }

  /** Sample walk tread under the player (world Y). */
  raycastDockSurface(x, z) {
    if (isOnPierCorridor(z) && !isOnDockStairs(x, z) && !isOnShoreDeck(x, z)) {
      if (!this.pierHeightMeshes.length) return DOCK_PIER_SURFACE_Y;
      this._stairRayOrigin.set(x, 8, z);
      this._stairRaycaster.set(this._stairRayOrigin, this._stairRayDir);
      const hits = this._stairRaycaster.intersectObjects(this.pierHeightMeshes, false);
      for (const hit of hits) {
        if (hit.point.y >= DOCK_PIER_MIN_SURFACE_Y) return hit.point.y;
      }
      return DOCK_PIER_SURFACE_Y;
    }

    if (!this.dockWalkMeshes.length) return null;
    this._stairRayOrigin.set(x, 8, z);
    this._stairRaycaster.set(this._stairRayOrigin, this._stairRayDir);
    const hits = this._stairRaycaster.intersectObjects(this.dockWalkMeshes, false);
    let surface = null;
    for (const hit of hits) {
      if (hit.point.y < 0.05) continue;
      if (isOnShoreDeck(x, z) && hit.point.y > 0.45) continue;
      if (surface == null || hit.point.y > surface) surface = hit.point.y;
    }
    return surface;
  }

  /** Sample pier/stair tread under the player so the camera rides the dock mesh. */
  getDockWalkEyeHeight(x, z) {
    const cache = this._dockEyeCache;
    if (Math.abs(x - cache.x) < 0.025 && Math.abs(z - cache.z) < 0.025 && cache.y != null) {
      return cache.y;
    }
    cache.x = x;
    cache.z = z;

    const surface = this.raycastDockSurface(x, z);
    if (surface != null) {
      cache.y = surface + DOCK_EYE_OFFSET;
      return cache.y;
    }

    if (isOnDockStairs(x, z)) {
      cache.y = getDockStairEyeHeightFallback(x, z);
      return cache.y;
    }

    if (isOnShoreDeck(x, z)) {
      cache.y = DOCK_SHORE_DECK.surfaceY + DOCK_EYE_OFFSET;
      return cache.y;
    }

    if (isOnPierCorridor(z) && !isOnDockStairs(x, z)) {
      cache.y = DOCK_PIER_SURFACE_Y + DOCK_EYE_OFFSET;
      return cache.y;
    }

    cache.y = null;
    return null;
  }

  /** Feet height on pier/stairs, or null on open ground. */
  getDockSurfaceHeight(x, z) {
    const eye = this.getDockWalkEyeHeight(x, z);
    return eye != null ? eye - DOCK_EYE_OFFSET : null;
  }

  /** @deprecated use getDockWalkEyeHeight */
  getDockStairEyeHeight(x, z) {
    return this.getDockWalkEyeHeight(x, z);
  }
}
