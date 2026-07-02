export const STORAGE_KEY = "kaden-vr-fishing-v1";

export const ZONES = {
  "Lake Dock": {
    id: "Lake Dock",
    label: "Lake Dock",
    description: "Calm shallows perfect for beginners.",
    teleport: { x: 0, y: 0, z: 4 },
    lookAt: { x: 0, y: 0, z: -8 },
    castCenter: { x: 0, z: -12 },
    castRadius: 8,
    depth: 0.3,
    skyTint: 0xc9edf9,
    fogColor: 0x8ec4d8,
    fogNear: 30,
    fogFar: 120,
    boatRequired: 1,
  },
  "North Cove": {
    id: "North Cove",
    label: "North Cove",
    description: "Rocky cove with trout and rare carp.",
    teleport: { x: -18, y: 0, z: -6 },
    lookAt: { x: -18, y: 0, z: -20 },
    castCenter: { x: -18, z: -22 },
    castRadius: 10,
    depth: 0.55,
    skyTint: 0xb8dce8,
    fogColor: 0x7ab0c4,
    fogNear: 25,
    fogFar: 100,
    boatRequired: 1,
  },
  "Deep Water": {
    id: "Deep Water",
    label: "Deep Water",
    description: "Heavy fish lurk beyond the drop-off.",
    teleport: { x: 22, y: 0, z: -14 },
    lookAt: { x: 22, y: 0, z: -28 },
    castCenter: { x: 22, z: -30 },
    castRadius: 12,
    depth: 0.85,
    skyTint: 0xa8cce0,
    fogColor: 0x5a8aa0,
    fogNear: 20,
    fogFar: 90,
    boatRequired: 2,
  },
};

export const FISH_SPECIES = [
  { id: "bluegill", name: "Bluegill", weight: [0.8, 2.2], rarity: "common", zones: ["Lake Dock"], color: 0x4a90c4, value: 8 },
  { id: "bass", name: "Bass", weight: [1.5, 4.5], rarity: "common", zones: ["Lake Dock", "North Cove", "Deep Water"], color: 0x3d6b4f, value: 12 },
  { id: "sunfish", name: "Sunfish", weight: [0.6, 1.8], rarity: "common", zones: ["Lake Dock"], color: 0xe8a030, value: 7 },
  { id: "trout", name: "Trout", weight: [1.8, 3.8], rarity: "uncommon", zones: ["North Cove"], color: 0xc47a5a, value: 18 },
  { id: "golden-carp", name: "Golden Carp", weight: [3.0, 5.5], rarity: "rare", zones: ["North Cove"], color: 0xffc832, value: 45 },
  { id: "catfish", name: "Catfish", weight: [3.5, 7.0], rarity: "uncommon", zones: ["Deep Water"], color: 0x5a4a3a, value: 22 },
  { id: "night-pike", name: "Night Pike", weight: [4.0, 8.5], rarity: "rare", zones: ["Deep Water"], color: 0x2a4a3a, value: 55 },
  { id: "lunker-bass", name: "Lunker Bass", weight: [5.0, 9.0], rarity: "legendary", zones: ["Deep Water"], color: 0x1a3a2a, value: 90 },
];

export const GEAR_COSTS = { rod: 25, boat: 40, bait: 18 };

export const DEFAULT_STATE = {
  fish: 0,
  coins: 50,
  rodLevel: 1,
  boatLevel: 1,
  baitKit: 1,
  zone: "Lake Dock",
  questProgress: { lakeFish: 0, visitedCove: false, rodUpgraded: false },
  codex: {},
  totalWeight: 0,
  bestCatch: null,
  settings: { music: true, sfx: true },
};

export const QUESTS = [
  { id: "lakeFish", label: "Catch 5 fish at Lake Dock", target: 5, reward: 30 },
  { id: "visitCove", label: "Fish at North Cove", target: 1, reward: 25 },
  { id: "rodUpgraded", label: "Upgrade your rod", target: 1, reward: 20 },
  { id: "rareCatch", label: "Catch a rare fish", target: 1, reward: 50 },
];

export const RARITY_WEIGHTS = {
  common: 55,
  uncommon: 28,
  rare: 14,
  legendary: 3,
};

export function pickFish(zone, rodLevel, baitKit) {
  const zoneFish = FISH_SPECIES.filter((f) => f.zones.includes(zone));
  const bonus = (rodLevel - 1) * 0.04 + (baitKit - 1) * 0.03;
  const weights = zoneFish.map((f) => {
    let w = RARITY_WEIGHTS[f.rarity] || 10;
    if (f.rarity !== "common") w *= 1 + bonus;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < zoneFish.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return zoneFish[i];
  }
  return zoneFish[0];
}

export function rollWeight(species) {
  const [min, max] = species.weight;
  return min + Math.random() * (max - min);
}

export function formatCatch(species, weight, zone) {
  return {
    speciesId: species.id,
    name: species.name,
    weight: Math.round(weight * 10) / 10,
    rarity: species.rarity,
    zone,
    value: Math.round(species.value * (1 + weight * 0.08)),
    timestamp: Date.now(),
  };
}
