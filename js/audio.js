import * as THREE from "three";

const SAMPLE_URLS = {
  ambient: "./assets/audio/ambient/fishing-port.ogg",
  ambientGulls: "./assets/audio/ambient/gulls-harbor.ogg",
  cast: "./assets/audio/kenney/impactWood_light_001.ogg",
  splash: "./assets/audio/kenney/impactSoft_heavy_002.ogg",
  bite: "./assets/audio/kenney/pepSound3.ogg",
  catch: "./assets/audio/kenney/powerUp1.ogg",
  legendaryCatch: "./assets/audio/kenney/powerUp10.ogg",
  reel: "./assets/audio/kenney/impactPlank_medium_001.ogg",
  snap: "./assets/audio/kenney/impactBell_heavy_001.ogg",
  escape: "./assets/audio/kenney/impactTin_medium_002.ogg",
  upgrade: "./assets/audio/kenney/phaserUp1.ogg",
  questComplete: "./assets/audio/kenney/threeTone1.ogg",
  uiClick: "./assets/audio/kenney/highUp.ogg",
};

let ctx = null;
let buffers = {};
let sfxEnabled = true;
let musicEnabled = true;
let ambientLayers = null;
let reelNodes = null;
let fireplaceNodes = null;
const _camDir = new THREE.Vector3();

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function updateAudioListener(camera) {
  if (!camera || !ctx) return;
  const l = ctx.listener;
  if (!l?.positionX) return;
  l.positionX.value = camera.position.x;
  l.positionY.value = camera.position.y;
  l.positionZ.value = camera.position.z;
  camera.getWorldDirection(_camDir);
  if (l.forwardX) {
    l.forwardX.value = _camDir.x;
    l.forwardY.value = _camDir.y;
    l.forwardZ.value = _camDir.z;
  }
}

export async function loadAudioAssets() {
  const ac = getCtx();
  await Promise.all(
    Object.entries(SAMPLE_URLS).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        buffers[key] = await ac.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        console.warn(`Failed to load audio ${url}`, err);
      }
    })
  );
}

export function setSfxEnabled(on) {
  sfxEnabled = on;
  if (!on) stopReelLoop();
}

export function setMusicEnabled(on) {
  musicEnabled = on;
  if (on) startAmbient();
  else stopAmbient();
}

export function applyAudioSettings(settings = {}) {
  setSfxEnabled(settings.sfx !== false);
  setMusicEnabled(settings.music !== false);
}

function tone(freq, duration, type = "sine", gain = 0.08, decay = 0.15) {
  if (!sfxEnabled) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + decay);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + decay);
}

function playSample(key, { gain = 0.35, rate = 1, loop = false } = {}) {
  if (!sfxEnabled && !key.startsWith("ambient")) return false;
  const buffer = buffers[key];
  if (!buffer) return false;
  const ac = getCtx();
  const src = ac.createBufferSource();
  const g = ac.createGain();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.loop = loop;
  g.gain.value = gain;
  src.connect(g);
  g.connect(ac.destination);
  src.start();
  return { src, g };
}

function playSpatialSample(key, position, camera, { gain = 0.35, rate = 1 } = {}) {
  if (!sfxEnabled) return false;
  const buffer = buffers[key];
  if (!buffer) return playSample(key, { gain, rate });
  if (!camera || !position) return playSample(key, { gain, rate });
  updateAudioListener(camera);
  const ac = getCtx();
  const src = ac.createBufferSource();
  const panner = ac.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1.2;
  panner.maxDistance = 45;
  const g = ac.createGain();
  g.gain.value = gain;
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(panner);
  panner.connect(g);
  g.connect(ac.destination);
  panner.positionX.value = position.x;
  panner.positionY.value = position.y;
  panner.positionZ.value = position.z;
  src.start();
  return true;
}

export function playSpatialAt(key, position, camera, opts = {}) {
  if (!playSpatialSample(key, position, camera, opts)) {
    if (key === "splash") playSplash(opts.gain ?? 0.2);
    else if (key === "bite") playBite();
  }
}

export function startAmbient() {
  if (!musicEnabled || ambientLayers) return;
  const port = playSample("ambient", { gain: 0.11, loop: true });
  const gulls = playSample("ambientGulls", { gain: 0.05, loop: true });
  if (port || gulls) {
    ambientLayers = [port, gulls].filter(Boolean);
    return;
  }
  const ac = getCtx();
  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  osc1.type = "sine";
  osc2.type = "triangle";
  osc1.frequency.value = 110;
  osc2.frequency.value = 164.8;
  filter.type = "lowpass";
  filter.frequency.value = 400;
  g.gain.value = 0.018;
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  osc1.start();
  osc2.start();
  ambientLayers = { osc1, osc2, g, procedural: true };
}

export function stopAmbient() {
  if (!ambientLayers) return;
  try {
    if (ambientLayers.procedural) {
      ambientLayers.osc1.stop();
      ambientLayers.osc2.stop();
    } else {
      ambientLayers.forEach((layer) => layer?.src?.stop());
    }
  } catch {
    /* already stopped */
  }
  ambientLayers = null;
}

export function setFireplaceActive(active, position, camera) {
  if (!musicEnabled && !sfxEnabled) return;
  if (active && !fireplaceNodes) {
    fireplaceNodes = playSample("ambient", { gain: 0.06, loop: true, rate: 0.65 }) || { procedural: true };
  } else if (!active && fireplaceNodes) {
    try {
      if (fireplaceNodes.procedural) return;
      fireplaceNodes.src?.stop();
    } catch { /* */ }
    fireplaceNodes = null;
  }
  if (active && position && camera) updateAudioListener(camera);
}

export function playCast() {
  if (!playSample("cast", { gain: 0.4 })) {
    tone(180, 0.1, "triangle", 0.06, 0.2);
    setTimeout(() => tone(320, 0.08, "sine", 0.04, 0.15), 60);
  }
}

export function playSplash(gain = 0.45) {
  if (!playSample("splash", { gain })) {
    if (!sfxEnabled) return;
    const ac = getCtx();
    const bufferSize = ac.sampleRate * 0.15;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ac.createBufferSource();
    const g = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    g.gain.value = 0.12;
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(g);
    g.connect(ac.destination);
    src.start();
  }
}

export function playSplashSoft(gain = 0.16) {
  playSplash(gain);
}

export function playSplashAt(position, camera, gain = 0.22) {
  playSpatialAt("splash", position, camera, { gain });
}

export function playBite() {
  if (!playSample("bite", { gain: 0.35 })) {
    tone(520, 0.05, "square", 0.05, 0.08);
    setTimeout(() => tone(680, 0.05, "square", 0.06, 0.1), 80);
  }
}

export function playBiteAt(position, camera) {
  playSpatialAt("bite", position, camera, { gain: 0.32 });
}

export function playNibble() {
  if (!playSample("splash", { gain: 0.1, rate: 1.75 })) {
    tone(420, 0.04, "sine", 0.035, 0.06);
  }
}

export function playHook() {
  if (!playSample("bite", { gain: 0.28, rate: 1.15 })) {
    tone(640, 0.06, "square", 0.07, 0.12);
    setTimeout(() => tone(820, 0.05, "sine", 0.05, 0.1), 70);
  }
}

export function playPreBite() {
  tone(280, 0.08, "triangle", 0.05, 0.16);
  setTimeout(() => tone(420, 0.06, "sine", 0.04, 0.12), 90);
}

export function playTensionWarning() {
  tone(180, 0.06, "sawtooth", 0.05, 0.1);
}

export function playSweetZonePulse() {
  tone(520, 0.04, "sine", 0.04, 0.08);
}

export function startReelLoop() {
  if (!sfxEnabled || reelNodes) return;
  const played = playSample("reel", { gain: 0.12, loop: true, rate: 0.85 });
  if (played) {
    reelNodes = played;
    return;
  }
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = 85;
  g.gain.value = 0.025;
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  reelNodes = { osc, g, procedural: true };
}

export function updateReelLoop(tension = 0.5, phase = "") {
  if (!reelNodes) return;
  const phaseBoost = phase === "run" || phase === "thrash" ? 1.25 : phase === "tired" ? 0.85 : 1;
  if (reelNodes.procedural) {
    reelNodes.osc.frequency.value = (70 + tension * 60) * phaseBoost;
    reelNodes.g.gain.value = 0.02 + tension * 0.02;
  } else {
    reelNodes.src.playbackRate.value = (0.7 + tension * 0.5) * phaseBoost;
    reelNodes.g.gain.value = 0.08 + tension * 0.06;
  }
}

export function stopReelLoop() {
  if (!reelNodes) return;
  try {
    if (reelNodes.procedural) reelNodes.osc.stop();
    else reelNodes.src.stop();
  } catch {
    /* already stopped */
  }
  reelNodes = null;
}

export function playCatch() {
  stopReelLoop();
  if (!playSample("catch", { gain: 0.4 })) {
    tone(440, 0.1, "sine", 0.08, 0.3);
    setTimeout(() => tone(660, 0.1, "sine", 0.07, 0.35), 100);
    setTimeout(() => tone(880, 0.15, "triangle", 0.06, 0.4), 200);
  }
}

export function playLegendaryCatch() {
  stopReelLoop();
  if (!playSample("legendaryCatch", { gain: 0.45 })) {
    tone(330, 0.12, "sine", 0.09, 0.35);
    setTimeout(() => tone(440, 0.12, "sine", 0.08, 0.4), 120);
    setTimeout(() => tone(554, 0.12, "triangle", 0.08, 0.45), 240);
    setTimeout(() => tone(880, 0.2, "triangle", 0.07, 0.55), 380);
  }
}

export function playFail(reason = "default") {
  stopReelLoop();
  if (reason === "snap" && playSample("snap", { gain: 0.4 })) return;
  if (reason === "escape" && playSample("escape", { gain: 0.35 })) return;
  tone(200, 0.15, "sawtooth", 0.06, 0.25);
}

export function playUpgrade() {
  if (!playSample("upgrade", { gain: 0.35 })) {
    tone(523, 0.08, "sine", 0.06, 0.2);
    setTimeout(() => tone(659, 0.1, "sine", 0.07, 0.25), 80);
  }
}

export function playQuestComplete() {
  if (!playSample("questComplete", { gain: 0.38 })) {
    tone(392, 0.1, "triangle", 0.07, 0.25);
    setTimeout(() => tone(523, 0.1, "triangle", 0.07, 0.3), 100);
    setTimeout(() => tone(659, 0.15, "sine", 0.06, 0.35), 200);
  }
}

export function playUIClick() {
  if (!playSample("uiClick", { gain: 0.25 })) {
    tone(600, 0.03, "sine", 0.03, 0.06);
  }
}

export function resumeAudio() {
  if (ctx?.state === "suspended") ctx.resume();
  if (musicEnabled) startAmbient();
}
