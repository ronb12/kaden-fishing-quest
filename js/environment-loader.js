import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export async function loadEnvironmentMaps(renderer) {
  const rgbeLoader = new RGBELoader();
  const texLoader = new THREE.TextureLoader();

  try {
    const hdr = await rgbeLoader.loadAsync("./assets/hdri/pond_1k.hdr");
    hdr.mapping = THREE.EquirectangularReflectionMapping;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();

    const groundDiff = await texLoader.loadAsync("./assets/textures/ground_grass_rock_diff.jpg");
    groundDiff.wrapS = groundDiff.wrapT = THREE.RepeatWrapping;
    groundDiff.repeat.set(36, 36);
    groundDiff.colorSpace = THREE.SRGBColorSpace;

    const groundNor = await texLoader.loadAsync("./assets/textures/ground_grass_rock_nor.jpg");
    groundNor.wrapS = groundNor.wrapT = THREE.RepeatWrapping;
    groundNor.repeat.set(36, 36);

    return { background: envMap, envMap, groundDiff, groundNor };
  } catch (err) {
    console.warn("Failed to load environment maps", err);
    return null;
  }
}
