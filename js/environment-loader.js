import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

function configureSkyTexture(texture) {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  return texture;
}

function buildEnvMap(renderer, hdr) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  envMap.minFilter = THREE.LinearFilter;
  envMap.magFilter = THREE.LinearFilter;
  pmrem.dispose();
  return envMap;
}

export async function loadEnvironmentMaps(renderer, quality = "high") {
  const rgbeLoader = new RGBELoader();
  const texLoader = new THREE.TextureLoader();
  const hdrPath = quality === "low"
    ? "./assets/hdri/pond_1k.hdr"
    : "./assets/hdri/pond_2k.hdr";

  try {
    const hdr = configureSkyTexture(await rgbeLoader.loadAsync(hdrPath));
    const envMap = buildEnvMap(renderer, hdr);

    const groundDiff = await texLoader.loadAsync("./assets/textures/ground_grass_rock_diff.jpg");
    groundDiff.wrapS = groundDiff.wrapT = THREE.RepeatWrapping;
    groundDiff.repeat.set(24, 24);
    groundDiff.colorSpace = THREE.SRGBColorSpace;
    groundDiff.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const groundNor = await texLoader.loadAsync("./assets/textures/ground_grass_rock_nor.jpg");
    groundNor.wrapS = groundNor.wrapT = THREE.RepeatWrapping;
    groundNor.repeat.set(24, 24);
    groundNor.anisotropy = renderer.capabilities.getMaxAnisotropy();

    return { background: hdr, envMap, groundDiff, groundNor };
  } catch (err) {
    console.warn("Failed to load environment maps", err);
    return null;
  }
}

export async function reloadEnvironmentMaps(renderer, scene, envMaps, quality = "high") {
  if (!scene || !envMaps) return null;
  const rgbeLoader = new RGBELoader();
  const hdrPath = quality === "low"
    ? "./assets/hdri/pond_1k.hdr"
    : "./assets/hdri/pond_2k.hdr";

  try {
    envMaps.background?.dispose();
    envMaps.envMap?.dispose();

    const hdr = configureSkyTexture(await rgbeLoader.loadAsync(hdrPath));
    const envMap = buildEnvMap(renderer, hdr);

    envMaps.background = hdr;
    envMaps.envMap = envMap;
    scene.background = hdr;
    scene.environment = envMap;

    return envMaps;
  } catch (err) {
    console.warn("Failed to reload environment maps", err);
    return null;
  }
}
