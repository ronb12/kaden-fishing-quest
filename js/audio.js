let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function setAudioEnabled(on) {
  enabled = on;
}

function tone(freq, duration, type = "sine", gain = 0.08, decay = 0.15) {
  if (!enabled) return;
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

export function playCast() {
  tone(180, 0.1, "triangle", 0.06, 0.2);
  setTimeout(() => tone(320, 0.08, "sine", 0.04, 0.15), 60);
}

export function playSplash() {
  if (!enabled) return;
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

export function playReel() {
  tone(90 + Math.random() * 20, 0.03, "sawtooth", 0.02, 0.05);
}

export function playCatch() {
  tone(440, 0.1, "sine", 0.08, 0.3);
  setTimeout(() => tone(660, 0.1, "sine", 0.07, 0.35), 100);
  setTimeout(() => tone(880, 0.15, "triangle", 0.06, 0.4), 200);
}

export function playFail() {
  tone(200, 0.15, "sawtooth", 0.06, 0.25);
}

export function resumeAudio() {
  if (ctx?.state === "suspended") ctx.resume();
}
