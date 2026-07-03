export const STORAGE_KEY = "kaden-vr-fishing-v1";

export const GEAR_MAX = { rod: 5, boat: 3, bait: 3 };
const GEAR_BASE_COST = { rod: 25, boat: 40, bait: 18 };

export function getGearCost(type, currentLevel) {
  return Math.round(GEAR_BASE_COST[type] * Math.pow(1.45, currentLevel - 1));
}

export const ZONES = {
  "Lake Dock": {
    id: "Lake Dock",
    label: "Lake Dock",
    description: "Calm shallows perfect for beginners.",
    teleport: { x: 0, y: 0, z: 13.5 },
    lookAt: { x: 0, y: 0, z: -4 },
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
  { id: "bluegill", name: "Bluegill", weight: [0.8, 2.2], rarity: "common", zones: ["Lake Dock"], color: 0x4a90c4, value: 8, modelKey: "BlueGoldfish" },
  { id: "bass", name: "Bass", weight: [1.5, 4.5], rarity: "common", zones: ["Lake Dock", "North Cove", "Deep Water"], color: 0x3d6b4f, value: 12, modelKey: "CoralGrouper" },
  { id: "sunfish", name: "Sunfish", weight: [0.6, 1.8], rarity: "common", zones: ["Lake Dock"], color: 0xe8a030, value: 7, modelKey: "Sunfish" },
  { id: "trout", name: "Trout", weight: [1.8, 3.8], rarity: "uncommon", zones: ["North Cove"], color: 0xc47a5a, value: 18, modelKey: "ParrotFish" },
  { id: "golden-carp", name: "Golden Carp", weight: [3.0, 5.5], rarity: "rare", zones: ["North Cove"], color: 0xffc832, value: 45, modelKey: "FlowerHorn" },
  { id: "catfish", name: "Catfish", weight: [3.5, 7.0], rarity: "uncommon", zones: ["Deep Water"], color: 0x5a4a3a, value: 22, modelKey: "ArmoredCatfish" },
  { id: "night-pike", name: "Night Pike", weight: [4.0, 8.5], rarity: "rare", zones: ["Deep Water"], color: 0x2a4a3a, value: 55, modelKey: "Piranha" },
  { id: "lunker-bass", name: "Lunker Bass", weight: [5.0, 9.0], rarity: "legendary", zones: ["Deep Water"], color: 0x1a3a2a, value: 90, modelKey: "GoblinShark" },
];

export const BAITS = [
  {
    id: "worm",
    name: "Nightcrawler",
    icon: "🪱",
    description: "Classic all-rounder. Fast bites for panfish and bass.",
    color: 0xc46a3a,
    meshType: "worm",
    modelKey: "Worm",
    waitBonus: 0.35,
    rarityBonus: 0,
    speciesBoost: ["bluegill", "sunfish", "bass"],
    unlockLevel: 1,
  },
  {
    id: "cricket",
    name: "Cricket",
    icon: "🦗",
    description: "Top choice for bluegill and sunfish in shallows.",
    color: 0x6a5a3a,
    meshType: "cricket",
    modelKey: "Lure_1",
    waitBonus: 0.45,
    rarityBonus: 0,
    speciesBoost: ["bluegill", "sunfish"],
    unlockLevel: 1,
  },
  {
    id: "minnow",
    name: "Live Minnow",
    icon: "🐟",
    description: "Predators love it. Great for bass and trout.",
    color: 0x8ab4c4,
    meshType: "minnow",
    modelKey: "Lure_2",
    waitBonus: 0.15,
    rarityBonus: 0.06,
    speciesBoost: ["bass", "trout", "night-pike"],
    unlockLevel: 1,
  },
  {
    id: "spinner",
    name: "Spinner Lure",
    icon: "✨",
    description: "Flashy blade attracts aggressive strikes.",
    color: 0xc0c0c0,
    meshType: "spinner",
    modelKey: "Lure_3",
    waitBonus: 0,
    rarityBonus: 0.1,
    speciesBoost: ["bass", "trout", "lunker-bass"],
    unlockLevel: 2,
  },
  {
    id: "dough",
    name: "Dough Ball",
    icon: "🟡",
    description: "Carp and catfish can't resist dough.",
    color: 0xe8c840,
    meshType: "dough",
    modelKey: "Lure_4",
    waitBonus: 0.2,
    rarityBonus: 0.12,
    speciesBoost: ["golden-carp", "catfish"],
    unlockLevel: 2,
  },
  {
    id: "jig",
    name: "Deep Jig",
    icon: "⚓",
    description: "Heavy jig for deep water trophies.",
    color: 0x3a5a6a,
    meshType: "jig",
    modelKey: "Lure_6",
    waitBonus: -0.1,
    rarityBonus: 0.18,
    speciesBoost: ["catfish", "night-pike", "lunker-bass"],
    unlockLevel: 3,
  },
];

export const DEFAULT_STATE = {
  fish: 0,
  coins: 50,
  rodLevel: 1,
  boatLevel: 1,
  baitKit: 1,
  selectedBait: "worm",
  zone: "Lake Dock",
  displayName: "",
  questProgress: {
    lakeFish: 0,
    visitedCove: false,
    rodUpgraded: false,
    deepWaterFish: 0,
    rareCatch: 0,
    legendaryCatch: 0,
  },
  codex: {},
  totalWeight: 0,
  bestCatch: null,
  claimedQuests: [],
  settings: { music: true, sfx: true, quality: "high" },
  lastSaved: 0,
};

export const QUESTS = [
  { id: "lakeFish", label: "Catch 5 fish at Lake Dock", target: 5, reward: 30 },
  { id: "visitCove", label: "Fish at North Cove", target: 1, reward: 25 },
  { id: "rodUpgraded", label: "Upgrade your rod", target: 1, reward: 20 },
  { id: "rareCatch", label: "Catch a rare fish", target: 1, reward: 50 },
  { id: "deepWaterFish", label: "Catch 3 fish in Deep Water", target: 3, reward: 40 },
  { id: "legendaryCatch", label: "Land a legendary fish", target: 1, reward: 100 },
  { id: "codexHalf", label: "Log 4 species in the codex", target: 4, reward: 35 },
];

export const RARITY_WEIGHTS = {
  common: 55,
  uncommon: 28,
  rare: 14,
  legendary: 3,
};

export function pickFish(zone, rodLevel, baitKit, baitId = "worm", legendaryBoost = false) {
  const zoneFish = FISH_SPECIES.filter((f) => f.zones.includes(zone));
  const bait = BAITS.find((b) => b.id === baitId) || BAITS[0];
  const bonus = (rodLevel - 1) * 0.04 + (baitKit - 1) * 0.03 + bait.rarityBonus;
  const weights = zoneFish.map((f) => {
    let w = RARITY_WEIGHTS[f.rarity] || 10;
    if (f.rarity !== "common") w *= 1 + bonus;
    if (f.rarity === "legendary" && legendaryBoost) w *= 3;
    if (bait.speciesBoost.includes(f.id)) w *= 1.8;
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

export function getBait(baitId) {
  return BAITS.find((b) => b.id === baitId) || BAITS[0];
}

export function isBaitUnlocked(bait, baitKit) {
  return baitKit >= bait.unlockLevel;
}

export function rollWeight(species) {
  const [min, max] = species.weight;
  return min + Math.random() * (max - min);
}

export function formatCatch(species, weight, zone, rodLevel = 1) {
  const base = species.value * (1 + weight * 0.08);
  const rodBonus = 1 + (rodLevel - 1) * 0.08;
  return {
    speciesId: species.id,
    name: species.name,
    weight: Math.round(weight * 10) / 10,
    rarity: species.rarity,
    zone,
    value: Math.round(base * rodBonus),
    timestamp: Date.now(),
    isNewSpecies: false,
  };
}

export function getRodDescription(level) {
  const coinPct = Math.round((level - 1) * 8);
  return `+${coinPct}% coin value · wider hook window · faster reel`;
}

export function getBoatDescription(level) {
  if (level >= 2) return "Deep Water unlocked · faster zone travel";
  return "Unlocks North Cove";
}

export function getBaitKitDescription(level) {
  return `Unlocks tier-${level} baits · +${Math.round((level - 1) * 3)}% rare fish odds`;
}
