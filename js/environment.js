import * as THREE from "three";
import { ZONES } from "./data.js";
import { getAssets, cloneModel, updateModelAnimations } from "./asset-loader.js";
import { Campground } from "./campground.js";
import { DOCK_GROUP } from "./dock-layout.js";

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
    gl_FragColor = vec4(col, 0.9);
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
    this.build();
  }

  build() {
    if (this.envMaps?.background) {
      this.scene.background = this.envMaps.background;
      this.scene.environment = this.envMaps.envMap;
      this.scene.fog = new THREE.Fog(0x8ab0a8, 35, 140);
    } else {
      this.scene.fog = new THREE.Fog(0x8ec4d8, 30, 120);
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
    this.buildZoneMarkers();
    this.campground = new Campground(this.scene);
    this.campFire = this.campground.campFire;
    this.buildZoneDressing();
    this.spawnAmbientFish();
  }

  buildZoneDressing() {
    this.buildDockZoneExtras();
    this.buildCoveZoneExtras();
    this.buildDeepWaterExtras();
  }

  buildDockZoneExtras() {
    const group = new THREE.Group();
    group.name = "Lake Dock";
    const assets = getAssets();
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3d8a4a, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.03, 8), padMat);
      pad.position.set(-4 + (i % 4) * 2.5, 0.02, -4 - Math.floor(i / 4) * 2);
      pad.rotation.x = Math.PI / 2;
      group.add(pad);
    }
    const lilyGltf = assets?.kenney?.lily_small;
    if (lilyGltf) {
      for (let i = 0; i < 10; i++) {
        const lily = cloneModel(lilyGltf, { scale: 1.6 + Math.random() * 0.4, rotationY: Math.random() * Math.PI });
        lily.position.set(-7 + (i % 5) * 2.8, 0.02, -7 - Math.floor(i / 5) * 2.2);
        group.add(lily);
      }
    }
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x8b5a34 })
    );
    sign.position.set(1.5, 1.2, 11.5);
    group.add(sign);
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
        group.add(bush);
      });
    }
    const pierGltf = assets?.env?.Dock_Long_NoRope || assets?.env?.Dock_Long;
    if (pierGltf) {
      const pier = cloneModel(pierGltf, { scale: 0.35, rotationY: Math.PI / 2 });
      pier.position.set(-18, 0, -4);
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
      buoy.position.set(26, 0.05, -20);
      group.add(buoy);
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

  buildGround() {
    const mat = this.envMaps?.groundDiff
      ? new THREE.MeshStandardMaterial({
          map: this.envMaps.groundDiff,
          normalMap: this.envMaps.groundNor,
          normalScale: new THREE.Vector2(0.4, 0.4),
          roughness: 0.92,
          metalness: 0.02,
        })
      : new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
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
    this.scene.add(this.waterMesh);
  }

  buildDock() {
    const assets = getAssets();
    const dockGroup = new THREE.Group();
    dockGroup.name = "Dock";
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a34, roughness: 0.85 });
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 0.82 });
    const longGltf = assets?.env?.Dock_Long_NoRope || assets?.env?.Dock_Long;

    const dockGltf = assets?.env?.Dock_Wide;
    if (dockGltf) {
      const dock = cloneModel(dockGltf, { scale: 0.4, rotationY: Math.PI });
      dock.position.set(0, 0, -1.8);
      dockGroup.add(dock);
    } else {
      for (let i = 0; i < 12; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.5), woodMat);
        plank.position.set(0, 0.15, -i * 0.55);
        dockGroup.add(plank);
      }
    }

    const bridgeZ = [0.8, 2.8, 4.8, 6.8, 8.8];
    if (longGltf) {
      bridgeZ.forEach((z) => {
        const seg = cloneModel(longGltf, { scale: 0.38, rotationY: Math.PI / 2 });
        seg.position.set(0, 0.05, z);
        dockGroup.add(seg);
      });
    } else {
      bridgeZ.forEach((z) => {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.1), woodMat);
        plank.position.set(0, 0.12, z);
        dockGroup.add(plank);
      });
    }

    const stairsGltf = assets?.env?.Dock_Stairs;
    if (stairsGltf) {
      const stairs = cloneModel(stairsGltf, { scale: 0.38, rotationY: 0 });
      stairs.position.set(0, 0.02, 10.2);
      dockGroup.add(stairs);
    } else {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.4), woodMat);
      ramp.position.set(0, 0.16, 10.2);
      ramp.rotation.x = -0.14;
      dockGroup.add(ramp);
    }

    const shoreDeck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 3.4), plankMat);
    shoreDeck.position.set(0, 0.14, 12.2);
    shoreDeck.receiveShadow = true;
    dockGroup.add(shoreDeck);

    const shoreBerm = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.95 })
    );
    shoreBerm.position.set(0, 0.06, 13.8);
    shoreBerm.receiveShadow = true;
    dockGroup.add(shoreBerm);

    dockGroup.position.set(DOCK_GROUP.x, 0, DOCK_GROUP.z);
    this.scene.add(dockGroup);
    this.dockGroup = dockGroup;
  }

  buildTrees() {
    const assets = getAssets();
    const treeSources = [
      { cat: "kenney", keys: ["tree_default", "tree_detailed", "tree_fat", "tree_cone", "tree_thin"] },
      { cat: "env", keys: ["BirchTree_1", "BirchTree_2", "BirchTree_3"] },
    ];
    const positions = [
      [-12, 8], [-8, 14], [10, 12], [14, 6], [-16, -4], [18, -2],
      [-6, 18], [8, 18], [-20, 10], [20, 8], [-14, 16], [16, 14],
    ];

    positions.forEach(([x, z], i) => {
      const useKenney = i % 2 === 0;
      const source = useKenney ? treeSources[0] : treeSources[1];
      const key = source.keys[i % source.keys.length];
      const gltf = assets?.[source.cat]?.[key];
      if (gltf) {
        const scale = useKenney
          ? 3.2 + Math.random() * 1.2
          : 0.55 + Math.random() * 0.25;
        const tree = cloneModel(gltf, { scale, rotationY: Math.random() * Math.PI * 2 });
        tree.position.set(x, 0, z);
        this.scene.add(tree);
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
      }
    });

    const grassGltf = assets?.kenney?.grass;
    const bushGltf = assets?.kenney?.plant_bushSmall;
    const scatter = [
      [-4, 11], [5, 10], [-10, 5], [12, 4], [-18, 2], [15, -1], [0, 12], [-8, 6],
    ];
    scatter.forEach(([x, z], i) => {
      const gltf = i % 2 === 0 ? grassGltf : bushGltf;
      if (!gltf) return;
      const prop = cloneModel(gltf, { scale: 2.0 + Math.random() * 0.8, rotationY: Math.random() * Math.PI });
      prop.position.set(x, 0, z);
      this.scene.add(prop);
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
        new THREE.MeshBasicMaterial({ color: 0xffd37a, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
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
      group.position.set(zone.teleport.x, 0, zone.teleport.z + 2);
      group.userData.zoneId = zone.id;
      group.userData.zoneLabel = zone.label;
      this.scene.add(group);
      this.zoneMarkers.push(group);
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
    this.scene.fog.near = zone.fogNear;
    this.scene.fog.far = zone.fogFar;
    this.waterUniforms.uDeepColor.value.setHSL(0.55, 0.5, 0.25 + zone.depth * 0.15);
    this.waterUniforms.uShallowColor.value.setHSL(0.52, 0.55, 0.45 + zone.depth * 0.1);
    Object.entries(this.zoneDressing).forEach(([id, group]) => {
      group.visible = id === zoneId;
    });
    if (this.dockGroup) this.dockGroup.visible = zoneId === "Lake Dock";
    if (this.campground?.group) this.campground.group.visible = zoneId === "Lake Dock";
  }

  setQuality(quality) {
    const low = quality === "low";
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      const segs = low ? 48 : 128;
      this.waterMesh.geometry = new THREE.PlaneGeometry(120, 120, segs, segs);
    }
  }

  update(time, dt = 0.016, camera = null) {
    this.waterUniforms.uTime.value = time;
    if (camera) this.waterUniforms.uCameraPos.value.copy(camera.position);
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
      Math.sin(wx * 2.8 - time * 3.0) * 0.05
    );
  }
}
