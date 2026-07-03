/** Rod and bait stat tables — modeled after Real VR Fishing float/lure depth systems. */

export const RODS = [
  {
    level: 1,
    id: "dockside",
    name: "Dockside Spin",
    action: "Fast",
    tagline: "Forgiving starter rod for panfish and bass.",
    castMult: 0.86,
    lineStrength: 0.9,
    reelMult: 0.88,
    hookBonus: 0,
    fightControl: 0.04,
    sweetZoneBonus: 0,
  },
  {
    level: 2,
    id: "creek-float",
    name: "Creek Float",
    action: "Medium",
    tagline: "Float-fishing specialist with a wider hook window.",
    castMult: 0.94,
    lineStrength: 0.93,
    reelMult: 0.96,
    hookBonus: 0.35,
    fightControl: 0.06,
    sweetZoneBonus: 0.04,
  },
  {
    level: 3,
    id: "lake-pro",
    name: "Lake Pro",
    action: "Medium",
    tagline: "Balanced all-rounder for every zone.",
    castMult: 1.0,
    lineStrength: 0.96,
    reelMult: 1.05,
    hookBonus: 0.2,
    fightControl: 0.1,
    sweetZoneBonus: 0.06,
  },
  {
    level: 4,
    id: "heavy-caster",
    name: "Heavy Caster",
    action: "Slow",
    tagline: "Long casts and strong line for big fights.",
    castMult: 1.12,
    lineStrength: 1.02,
    reelMult: 1.12,
    hookBonus: 0.15,
    fightControl: 0.14,
    sweetZoneBonus: 0.04,
  },
  {
    level: 5,
    id: "trophy-carbon",
    name: "Trophy Carbon",
    action: "Extra-fast",
    tagline: "Tournament carbon — max distance, drag, and control.",
    castMult: 1.18,
    lineStrength: 1.08,
    reelMult: 1.22,
    hookBonus: 0.45,
    fightControl: 0.2,
    sweetZoneBonus: 0.1,
  },
];

export const PRESENTATION = {
  FLOAT: "float",
  BOTTOM: "bottom",
  LURE: "lure",
  JIG: "jig",
};

export const DEPTH = {
  SURFACE: "surface",
  SHALLOW: "shallow",
  MID: "mid",
  DEEP: "deep",
};

export function getRodStats(rodLevel = 1) {
  const lvl = Math.min(5, Math.max(1, rodLevel));
  return RODS[lvl - 1];
}

export function getRodDescription(rodLevel) {
  const r = getRodStats(rodLevel);
  const cast = Math.round((r.castMult - 0.85) * 100);
  const line = Math.round((r.lineStrength - 0.88) * 100);
  const reel = Math.round((r.reelMult - 0.85) * 100);
  return `${r.name} · ${r.action} action · +${cast}% cast · +${line}% line · +${reel}% reel`;
}

export function getSnapThreshold(rodLevel) {
  const strength = getRodStats(rodLevel).lineStrength;
  return Math.min(0.98, 0.9 + (strength - 0.88) * 0.35);
}

export function getSweetZone(rodLevel) {
  const bonus = getRodStats(rodLevel).sweetZoneBonus;
  return {
    low: 0.28 - bonus * 0.15,
    high: 0.7 + bonus * 0.12,
  };
}

/** Zone depth (0–1) vs bait preferred depth. */
export function baitDepthMatch(bait, zoneDepth = 0.3) {
  const depthScore = {
    surface: zoneDepth < 0.25 ? 1.25 : zoneDepth < 0.45 ? 0.85 : 0.55,
    shallow: zoneDepth < 0.4 ? 1.2 : zoneDepth < 0.6 ? 1.0 : 0.7,
    mid: zoneDepth >= 0.35 && zoneDepth <= 0.7 ? 1.25 : 0.8,
    deep: zoneDepth > 0.55 ? 1.25 : zoneDepth > 0.4 ? 0.9 : 0.6,
  };
  return depthScore[bait?.depth] ?? 1;
}

export function baitZoneAffinity(bait, zoneId) {
  return bait?.zoneAffinity?.[zoneId] ?? 1;
}

export function isLurePresentation(bait) {
  return bait?.presentation === PRESENTATION.LURE || bait?.presentation === PRESENTATION.JIG;
}

export function isFloatPresentation(bait) {
  return bait?.presentation === PRESENTATION.FLOAT || bait?.presentation === PRESENTATION.BOTTOM;
}

export function nibbleStyleForBait(bait) {
  if (bait?.nibbleStyle) return bait.nibbleStyle;
  if (isLurePresentation(bait)) return "strike";
  if (bait?.presentation === PRESENTATION.BOTTOM) return "slow";
  return "frequent";
}

export function baitStatsLine(bait) {
  if (!bait) return "";
  const pres =
    bait.presentation === PRESENTATION.FLOAT
      ? "Float"
      : bait.presentation === PRESENTATION.BOTTOM
        ? "Bottom"
        : bait.presentation === PRESENTATION.JIG
          ? "Jig"
          : "Lure";
  const sink =
    bait.sinkSpeed === 0
      ? "topwater"
      : bait.sinkSpeed < 0.4
        ? "slow sink"
        : bait.sinkSpeed < 0.7
          ? "mid sink"
          : "fast sink";
  return `${pres} · ${bait.depth} · ${sink}`;
}

export function getBaitKitDescription(level) {
  const tiers = ["starter", "angler", "pro", "trophy"];
  const tier = tiers[Math.min(3, Math.max(0, level - 1))];
  return `Unlocks ${tier} tackle · +${Math.round((level - 1) * 4)}% rare fish odds`;
}
