import { DOCK_SPAWN } from "./dock-layout.js";
import { baitDepthMatch, baitZoneAffinity, getRodStats, getRodDescription, getBaitKitDescription } from "./gear-stats.js";

export { getRodDescription, getBaitKitDescription };

export const STORAGE_KEY = "kaden-vr-fishing-v1";

export const GEAR_MAX = { rod: 5, boat: 3, bait: 4 };
const GEAR_BASE_COST = { rod: 25, boat: 40, bait: 18 };

export function getGearCost(type, currentLevel) {
  return Math.round(GEAR_BASE_COST[type] * Math.pow(1.45, currentLevel - 1));
}

export const ZONES = {
  "Lake Dock": {
    id: "Lake Dock",
    label: "Lake Dock",
    description: "Calm shallows perfect for beginners.",
    teleport: { x: DOCK_SPAWN.x, y: DOCK_SPAWN.y, z: DOCK_SPAWN.z },
    lookAt: { x: 0, y: 0.4, z: -12 },
    castCenter: { x: 0, z: -12 },
    castRadius: 8,
    depth: 0.3,
    skyTint: 0xc9edf9,
    fogColor: 0x8ec4d8,
    fogNear: 48,
    fogFar: 150,
    boatRequired: 1,
  },
  "North Cove": {
    id: "North Cove",
    label: "North Cove",
    description: "Rocky cove with trout and rare carp.",
    teleport: { x: -18, y: 0, z: -6 },
    lookAt: { x: -18, y: 0.4, z: -22 },
    castCenter: { x: -18, z: -22 },
    castRadius: 10,
    depth: 0.55,
    skyTint: 0xb8dce8,
    fogColor: 0x7ab0c4,
    fogNear: 42,
    fogFar: 140,
    boatRequired: 1,
  },
  "Deep Water": {
    id: "Deep Water",
    label: "Deep Water",
    description: "Heavy fish lurk beyond the drop-off.",
    teleport: { x: 22, y: 0, z: -14 },
    lookAt: { x: 22, y: 0.4, z: -30 },
    castCenter: { x: 22, z: -30 },
    castRadius: 12,
    depth: 0.85,
    skyTint: 0xa8cce0,
    fogColor: 0x5a8aa0,
    fogNear: 40,
    fogFar: 130,
    boatRequired: 2,
  },
  "Moonlit Cove": {
    id: "Moonlit Cove",
    label: "Moonlit Cove",
    description: "Quiet moonlit shallows — nocturnal species feed after dusk.",
    teleport: { x: -8, y: 0, z: -28 },
    lookAt: { x: -8, y: 0.4, z: -38 },
    castCenter: { x: -8, z: -38 },
    castRadius: 9,
    depth: 0.42,
    skyTint: 0x6a8ab8,
    fogColor: 0x4a6a88,
    fogNear: 38,
    fogFar: 120,
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
  { id: "clownfish", name: "Clownfish", weight: [0.5, 1.4], rarity: "common", zones: ["Lake Dock"], color: 0xff8844, value: 9, modelKey: "Clownfish" },
  { id: "koi", name: "Koi", weight: [2.0, 4.5], rarity: "uncommon", zones: ["Lake Dock", "Moonlit Cove"], color: 0xff6644, value: 20, modelKey: "Koi" },
  { id: "perch", name: "Yellow Perch", weight: [0.9, 2.4], rarity: "common", zones: ["North Cove"], color: 0xd4a030, value: 10, modelKey: "Tetra" },
  { id: "snapper", name: "Red Snapper", weight: [2.5, 5.0], rarity: "uncommon", zones: ["North Cove", "Deep Water"], color: 0xc04040, value: 24, modelKey: "RedSnapper" },
  { id: "puffer", name: "Pufferfish", weight: [1.2, 3.0], rarity: "uncommon", zones: ["North Cove", "Moonlit Cove"], color: 0xe8d878, value: 19, modelKey: "Puffer" },
  { id: "tang", name: "Blue Tang", weight: [1.0, 2.8], rarity: "common", zones: ["Moonlit Cove"], color: 0x3080d0, value: 11, modelKey: "BlueTang" },
  { id: "butterfly", name: "Butterfly Fish", weight: [0.7, 2.0], rarity: "common", zones: ["Moonlit Cove"], color: 0xffcc44, value: 10, modelKey: "ButterflyFish" },
  { id: "idol", name: "Moorish Idol", weight: [1.5, 3.2], rarity: "rare", zones: ["Moonlit Cove"], color: 0xeedd88, value: 48, modelKey: "MoorishIdol" },
  { id: "tuna", name: "Tuna", weight: [8.0, 18.0], rarity: "uncommon", zones: ["Deep Water"], color: 0x4a6080, value: 32, modelKey: "Tuna" },
  { id: "swordfish", name: "Swordfish", weight: [12.0, 28.0], rarity: "rare", zones: ["Deep Water"], color: 0x607090, value: 65, modelKey: "Swordfish" },
  { id: "angler", name: "Anglerfish", weight: [3.0, 6.5], rarity: "rare", zones: ["Deep Water", "Moonlit Cove"], color: 0x3a2850, value: 52, modelKey: "Anglerfish" },
  { id: "mandarin", name: "Mandarin Dragonet", weight: [4.5, 8.0], rarity: "legendary", zones: ["Moonlit Cove"], color: 0x40a0a0, value: 95, modelKey: "MandarinFish" },
];

export const BAITS = [
  {
    id: "worm",
    name: "Nightcrawler",
    icon: "🪱",
    description: "Classic float bait — steady nibbles for panfish and bass.",
    color: 0xc46a3a,
    meshType: "worm",
    modelKey: "Worm",
    presentation: "float",
    depth: "shallow",
    sinkSpeed: 0.15,
    nibbleStyle: "frequent",
    waitBonus: 0.35,
    rarityBonus: 0,
    speciesBoost: ["bluegill", "sunfish", "bass"],
    zoneAffinity: { "Lake Dock": 1.3, "North Cove": 0.95, "Deep Water": 0.65, "Moonlit Cove": 0.9 },
    unlockLevel: 1,
  },
  {
    id: "cricket",
    name: "Grasshopper",
    icon: "🦗",
    description: "Topwater float bait — fast bites on bluegill and sunfish.",
    color: 0x6a8a3a,
    meshType: "cricket",
    modelKey: "Lure_1",
    presentation: "float",
    depth: "surface",
    sinkSpeed: 0,
    nibbleStyle: "frequent",
    waitBonus: 0.42,
    rarityBonus: 0,
    speciesBoost: ["bluegill", "sunfish"],
    zoneAffinity: { "Lake Dock": 1.35, "North Cove": 0.85, "Deep Water": 0.5, "Moonlit Cove": 1.0 },
    unlockLevel: 1,
  },
  {
    id: "dough",
    name: "Dough Ball",
    icon: "🟡",
    description: "Bottom float bait — carp and catfish patrol the floor.",
    color: 0xe8c840,
    meshType: "dough",
    modelKey: "Lure_4",
    presentation: "bottom",
    depth: "shallow",
    sinkSpeed: 0.55,
    nibbleStyle: "slow",
    waitBonus: 0.22,
    rarityBonus: 0.1,
    speciesBoost: ["golden-carp", "catfish"],
    zoneAffinity: { "Lake Dock": 0.9, "North Cove": 1.2, "Deep Water": 0.85, "Moonlit Cove": 0.95 },
    unlockLevel: 1,
  },
  {
    id: "minnow",
    name: "Live Shiner",
    icon: "🐟",
    description: "Mid-depth float bait — predators strike hard.",
    color: 0x8ab4c4,
    meshType: "minnow",
    modelKey: "Lure_2",
    presentation: "float",
    depth: "mid",
    sinkSpeed: 0.35,
    nibbleStyle: "normal",
    waitBonus: 0.12,
    rarityBonus: 0.08,
    speciesBoost: ["bass", "trout", "night-pike"],
    zoneAffinity: { "Lake Dock": 0.95, "North Cove": 1.25, "Deep Water": 1.05, "Moonlit Cove": 1.15 },
    unlockLevel: 2,
  },
  {
    id: "spinner",
    name: "Spinner Blade",
    icon: "✨",
    description: "Active lure — twitch the rod to flash the blade and draw strikes.",
    color: 0xc0c0c0,
    meshType: "spinner",
    modelKey: "Lure_3",
    presentation: "lure",
    depth: "mid",
    sinkSpeed: 0.4,
    nibbleStyle: "strike",
    waitBonus: -0.05,
    rarityBonus: 0.12,
    lureActivityNeed: 0.45,
    speciesBoost: ["bass", "trout", "lunker-bass"],
    zoneAffinity: { "Lake Dock": 1.0, "North Cove": 1.15, "Deep Water": 1.1, "Moonlit Cove": 1.05 },
    unlockLevel: 2,
  },
  {
    id: "crankbait",
    name: "Crankbait",
    icon: "🐠",
    description: "Diving lure — crank and pause for aggressive bass and pike.",
    color: 0x2a6a8a,
    meshType: "crankbait",
    modelKey: "Lure_5",
    presentation: "lure",
    depth: "mid",
    sinkSpeed: 0.65,
    nibbleStyle: "strike",
    waitBonus: -0.08,
    rarityBonus: 0.14,
    lureActivityNeed: 0.5,
    speciesBoost: ["bass", "night-pike", "lunker-bass"],
    zoneAffinity: { "Lake Dock": 0.85, "North Cove": 1.1, "Deep Water": 1.2, "Moonlit Cove": 1.0 },
    unlockLevel: 3,
  },
  {
    id: "popper",
    name: "Surface Popper",
    icon: "💦",
    description: "Topwater lure — stays on the surface; jerk to pop and attract.",
    color: 0xe85a4a,
    meshType: "popper",
    modelKey: "Lure_1",
    presentation: "lure",
    depth: "surface",
    sinkSpeed: 0,
    nibbleStyle: "strike",
    waitBonus: 0.05,
    rarityBonus: 0.08,
    lureActivityNeed: 0.4,
    speciesBoost: ["bass", "sunfish", "bluegill"],
    zoneAffinity: { "Lake Dock": 1.25, "North Cove": 0.9, "Deep Water": 0.55, "Moonlit Cove": 1.25 },
    unlockLevel: 3,
  },
  {
    id: "softbait",
    name: "Soft Plastic",
    icon: "🟢",
    description: "Slow-sink lure — versatile; works in most depths with a wiggle.",
    color: 0x4a9a5a,
    meshType: "softbait",
    modelKey: "Lure_4",
    presentation: "lure",
    depth: "mid",
    sinkSpeed: 0.3,
    nibbleStyle: "normal",
    waitBonus: 0.08,
    rarityBonus: 0.1,
    lureActivityNeed: 0.35,
    speciesBoost: ["bass", "trout", "catfish", "golden-carp"],
    zoneAffinity: { "Lake Dock": 1.05, "North Cove": 1.1, "Deep Water": 1.05, "Moonlit Cove": 1.1 },
    unlockLevel: 3,
  },
  {
    id: "jig",
    name: "Metal Jig",
    icon: "⚓",
    description: "Fast-sinking jig — drop deep for trophies and heavy fighters.",
    color: 0x3a5a6a,
    meshType: "jig",
    modelKey: "Lure_6",
    presentation: "jig",
    depth: "deep",
    sinkSpeed: 0.9,
    nibbleStyle: "strike",
    waitBonus: -0.15,
    rarityBonus: 0.2,
    lureActivityNeed: 0.55,
    speciesBoost: ["catfish", "night-pike", "lunker-bass"],
    zoneAffinity: { "Lake Dock": 0.6, "North Cove": 0.95, "Deep Water": 1.35, "Moonlit Cove": 1.2 },
    unlockLevel: 4,
  },
  {
    id: "krill",
    name: "Krill Cluster",
    icon: "🦐",
    description: "Mid-depth float bait — trout and rare cove species love it.",
    color: 0xffa8a0,
    meshType: "krill",
    modelKey: "Lure_6",
    presentation: "float",
    depth: "mid",
    sinkSpeed: 0.45,
    nibbleStyle: "normal",
    waitBonus: 0.18,
    rarityBonus: 0.15,
    speciesBoost: ["trout", "golden-carp", "bass"],
    zoneAffinity: { "Lake Dock": 0.8, "North Cove": 1.3, "Deep Water": 1.0, "Moonlit Cove": 1.15 },
    unlockLevel: 4,
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
    visitedMoonlit: false,
    rodUpgraded: false,
    deepWaterFish: 0,
    moonlitFish: 0,
    rareCatch: 0,
    legendaryCatch: 0,
    sweetZoneReels: 0,
  },
  codex: {},
  totalWeight: 0,
  bestCatch: null,
  claimedQuests: [],
  daily: { date: "", progress: {}, claimed: false, streak: 0, lastPlayDate: "" },
  trophies: [],
  questChainProgress: {},
  claimedCodexRewards: [],
  claimedChainRewards: [],
  fightsWon: 0,
  settings: {
    music: true,
    sfx: true,
    quality: "high",
    vrSnapTurn: true,
    vrSnapAngle: 45,
    vrTeleport: false,
    reelAssist: false,
    spatialAudio: true,
    handTracking: false,
    fightCoachSeen: false,
  },
  tutorial: {
    completed: false,
    step: 0,
    active: true,
    tipsSeen: {},
    guideSection: "basics",
  },
  lastSaved: 0,
};

export const QUESTS = [
  { id: "lakeFish", label: "Catch 5 fish at Lake Dock", target: 5, reward: 30 },
  { id: "visitCove", label: "Fish at North Cove", target: 1, reward: 25 },
  { id: "visitMoonlit", label: "Fish at Moonlit Cove", target: 1, reward: 30 },
  { id: "rodUpgraded", label: "Upgrade your rod", target: 1, reward: 20 },
  { id: "rareCatch", label: "Catch a rare fish", target: 1, reward: 50 },
  { id: "deepWaterFish", label: "Catch 3 fish in Deep Water", target: 3, reward: 40 },
  { id: "moonlitFish", label: "Catch 3 fish at Moonlit Cove", target: 3, reward: 45 },
  { id: "legendaryCatch", label: "Land a legendary fish", target: 1, reward: 100 },
  { id: "codexHalf", label: "Log 4 species in the codex", target: 4, reward: 35 },
  { id: "codexTen", label: "Log 10 species in the codex", target: 10, reward: 75 },
];

export const DAILY_CHALLENGES = [
  { id: "catch3", label: "Catch 3 fish today", target: 3, reward: 20 },
  { id: "sweetReel", label: "Reel in the sweet zone 5 times", target: 5, reward: 25 },
  { id: "visitZone", label: "Fish in 2 different zones", target: 2, reward: 15 },
];

export const CODEX_MILESTONES = [
  { id: "codex5", label: "Log 5 species", target: 5, reward: 40 },
  { id: "codex10", label: "Log 10 species", target: 10, reward: 80 },
  { id: "codex15", label: "Log 15 species", target: 15, reward: 120 },
];

export const QUEST_CHAINS = [
  {
    id: "dockExplorer",
    title: "Dock to Cove Explorer",
    reward: 60,
    steps: [
      { type: "lakeFish", target: 3, label: "Catch 3 fish at Lake Dock" },
      { type: "visitCove", target: 1, label: "Visit North Cove" },
      { type: "rareCatch", target: 1, label: "Land a rare fish" },
    ],
  },
  {
    id: "legendaryHunt",
    title: "Legendary Hunt",
    reward: 150,
    steps: [
      { type: "deepWaterFish", target: 2, label: "Catch 2 fish in Deep Water" },
      { type: "visitMoonlit", target: 1, label: "Fish Moonlit Cove" },
      { type: "legendaryCatch", target: 1, label: "Land a legendary fish" },
    ],
  },
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
  const zoneData = ZONES[zone];
  const depthMatch = baitDepthMatch(bait, zoneData?.depth ?? 0.3);
  const zoneMatch = baitZoneAffinity(bait, zone);
  const bonus =
    (rodLevel - 1) * 0.04 + (baitKit - 1) * 0.03 + bait.rarityBonus + (depthMatch - 1) * 0.08 + (zoneMatch - 1) * 0.06;
  const weights = zoneFish.map((f) => {
    let w = RARITY_WEIGHTS[f.rarity] || 10;
    if (f.rarity !== "common") w *= 1 + bonus;
    if (f.rarity === "legendary" && legendaryBoost) w *= 3;
    if (bait.speciesBoost.includes(f.id)) w *= 1.85 * zoneMatch;
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
  const rodBonus = 1 + (getRodStats(rodLevel).reelMult - 0.88) * 0.35;
  const colorHex = `#${(species.color ?? 0x4a90c4).toString(16).padStart(6, "0")}`;
  return {
    speciesId: species.id,
    name: species.name,
    weight: Math.round(weight * 10) / 10,
    rarity: species.rarity,
    zone,
    value: Math.round(base * rodBonus),
    timestamp: Date.now(),
    isNewSpecies: false,
    color: colorHex,
    modelKey: species.modelKey,
  };
}

/** Boat tier at which the skiff model appears moored at the dock. */
export const BOAT_SHOW_LEVEL = 2;
/** Boat tier required to board the skiff and sail to distant zones. */
export const BOAT_USE_LEVEL = 2;

export function shouldShowBoat(boatLevel) {
  return boatLevel >= BOAT_SHOW_LEVEL;
}

export function canUseBoat(boatLevel) {
  return boatLevel >= BOAT_USE_LEVEL;
}

/** Zones reachable by boarding the skiff (not shore walk / menu shortcuts). */
export function canBoatTravelToZone(boatLevel, zoneId) {
  if (zoneId === "Lake Dock" || !canUseBoat(boatLevel)) return false;
  const zone = ZONES[zoneId];
  if (!zone) return false;
  return boatLevel >= zone.boatRequired;
}

export function getBoatDescription(level) {
  if (level >= 3) return "Master skiff · fastest sail · reach every zone from the dock";
  if (level >= BOAT_USE_LEVEL) return "Skiff at dock · board to sail to distant zones (VR: trigger at mooring)";
  return "Upgrade to unlock the skiff and sail beyond the dock";
}

export function getBoatSpeedMultiplier(level) {
  if (level >= 3) return 1.35;
  if (level >= 2) return 1.0;
  return 0.85;
}

/** Model keys required by current fish roster — lazy-loaded instead of full manifest. */
export function getRequiredFishModelKeys() {
  return [...new Set(FISH_SPECIES.map((f) => f.modelKey).filter(Boolean))];
}
