let ctx = null;
let sfxEnabled = true;
let musicEnabled = true;
let ambientNodes = null;
let reelNodes = null;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
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

export function startAmbient() {
  if (!musicEnabled || ambientNodes) return;
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
  ambientNodes = { osc1, osc2, g };
}

export function stopAmbient() {
  if (!ambientNodes) return;
  try {
    ambientNodes.osc1.stop();
    ambientNodes.osc2.stop();
  } catch {
    /* already stopped */
  }
  ambientNodes = null;
}

export function playCast() {
  tone(180, 0.1, "triangle", 0.06, 0.2);
  setTimeout(() => tone(320, 0.08, "sine", 0.04, 0.15), 60);
}

export function playSplash() {
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

export function playBite() {
  tone(520, 0.05, "square", 0.05, 0.08);
  setTimeout(() => tone(680, 0.05, "square", 0.06, 0.1), 80);
}

export function startReelLoop() {
  if (!sfxEnabled || reelNodes) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = 85;
  g.gain.value = 0.025;
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  reelNodes = { osc, g };
}

export function updateReelLoop(tension = 0.5) {
  if (!reelNodes) return;
  reelNodes.osc.frequency.value = 70 + tension * 60;
  reelNodes.g.gain.value = 0.02 + tension * 0.02;
}

export function stopReelLoop() {
  if (!reelNodes) return;
  try {
    reelNodes.osc.stop();
  } catch {
    /* already stopped */
  }
  reelNodes = null;
}

export function playCatch() {
  stopReelLoop();
  tone(440, 0.1, "sine", 0.08, 0.3);
  setTimeout(() => tone(660, 0.1, "sine", 0.07, 0.35), 100);
  setTimeout(() => tone(880, 0.15, "triangle", 0.06, 0.4), 200);
}

export function playLegendaryCatch() {
  stopReelLoop();
  tone(330, 0.12, "sine", 0.09, 0.35);
  setTimeout(() => tone(440, 0.12, "sine", 0.08, 0.4), 120);
  setTimeout(() => tone(554, 0.12, "triangle", 0.08, 0.45), 240);
  setTimeout(() => tone(880, 0.2, "triangle", 0.07, 0.55), 380);
}

export function playFail(reason = "default") {
  stopReelLoop();
  if (reason === "snap") tone(150, 0.2, "sawtooth", 0.08, 0.3);
  else if (reason === "escape") tone(240, 0.15, "triangle", 0.05, 0.25);
  else tone(200, 0.15, "sawtooth", 0.06, 0.25);
}

export function playUpgrade() {
  tone(523, 0.08, "sine", 0.06, 0.2);
  setTimeout(() => tone(659, 0.1, "sine", 0.07, 0.25), 80);
}

export function playQuestComplete() {
  tone(392, 0.1, "triangle", 0.07, 0.25);
  setTimeout(() => tone(523, 0.1, "triangle", 0.07, 0.3), 100);
  setTimeout(() => tone(659, 0.15, "sine", 0.06, 0.35), 200);
}

export function playUIClick() {
  tone(600, 0.03, "sine", 0.03, 0.06);
}

export function resumeAudio() {
  if (ctx?.state === "suspended") ctx.resume();
  if (musicEnabled) startAmbient();
}
