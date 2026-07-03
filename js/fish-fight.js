import * as THREE from "three";
import { nibbleStyleForBait, getSweetZone, getSnapThreshold } from "./gear-stats.js";

export const FightPhase = {
  TIRED: "tired",
  SURGE: "surge",
  RUN: "run",
  DIVE: "dive",
  THRASH: "thrash",
};

const FIGHT_PROFILES = {
  common: { strength: 0.042, stamina: 9, runChance: 0.16 },
  uncommon: { strength: 0.058, stamina: 13, runChance: 0.24 },
  rare: { strength: 0.078, stamina: 17, runChance: 0.32 },
  legendary: { strength: 0.105, stamina: 24, runChance: 0.4 },
};

export function getFishFightProfile(species) {
  return FIGHT_PROFILES[species?.rarity] || FIGHT_PROFILES.common;
}

export class FishFightAI {
  constructor() {
    this.phase = FightPhase.TIRED;
    this.phaseTimer = 0;
    this.pullDir = new THREE.Vector2(0, -1);
    this.pullStrength = 0;
    this.stamina = 10;
    this.profile = FIGHT_PROFILES.common;
    this.lastPhase = FightPhase.TIRED;
  }

  reset(species) {
    this.profile = getFishFightProfile(species);
    this.stamina = this.profile.stamina;
    this.enterPhase(FightPhase.TIRED);
  }

  enterPhase(phase) {
    this.lastPhase = this.phase;
    this.phase = phase;
    const angle = Math.random() * Math.PI * 2;
    this.pullDir.set(Math.sin(angle), Math.cos(angle));

    const durations = {
      [FightPhase.TIRED]: 1.4 + Math.random() * 1.8,
      [FightPhase.SURGE]: 0.45 + Math.random() * 0.55,
      [FightPhase.RUN]: 0.9 + Math.random() * 1.3,
      [FightPhase.DIVE]: 0.55 + Math.random() * 0.75,
      [FightPhase.THRASH]: 0.28 + Math.random() * 0.35,
    };
    const strengths = {
      [FightPhase.TIRED]: 0.12,
      [FightPhase.SURGE]: 0.52,
      [FightPhase.RUN]: 0.78,
      [FightPhase.DIVE]: 0.48,
      [FightPhase.THRASH]: 0.92,
    };
    this.phaseTimer = durations[phase] || 1;
    this.pullStrength = strengths[phase] || 0.3;
  }

  pickNextPhase() {
    if (this.stamina <= 0 || Math.random() < 0.32) {
      this.enterPhase(FightPhase.TIRED);
      return;
    }
    if (Math.random() > this.profile.runChance) {
      this.enterPhase(FightPhase.TIRED);
      return;
    }
    const roll = Math.random();
    if (roll < 0.34) this.enterPhase(FightPhase.RUN);
    else if (roll < 0.58) this.enterPhase(FightPhase.DIVE);
    else if (roll < 0.82) this.enterPhase(FightPhase.SURGE);
    else this.enterPhase(FightPhase.THRASH);
  }

  /**
   * @returns {{ tensionDelta: number, reelMult: number, pullX: number, pullZ: number, phase: string, phaseChanged: boolean, pullIntensity: number }}
   */
  update(dt, isReeling, reelIntensity = 1) {
    this.phaseTimer -= dt;
    const fighting = this.phase !== FightPhase.TIRED;
    this.stamina -= dt * (fighting ? 1.15 : 0.35);

    let phaseChanged = false;
    if (this.phaseTimer <= 0) {
      this.pickNextPhase();
      phaseChanged = this.phase !== this.lastPhase;
    }

    const pullTension = this.pullStrength * this.profile.strength * dt * 60;
    const reelEase = isReeling ? reelIntensity * 0.035 : 0;
    const tiredBonus = this.phase === FightPhase.TIRED ? reelEase * 1.6 : reelEase * 0.25;

    return {
      tensionDelta: pullTension - tiredBonus,
      reelMult:
        this.phase === FightPhase.TIRED ? 1.4 : this.phase === FightPhase.THRASH ? 0.12 : 0.45,
      pullX: this.pullDir.x * this.pullStrength,
      pullZ: this.pullDir.y * this.pullStrength,
      phase: this.phase,
      phaseChanged,
      pullIntensity: this.pullStrength,
    };
  }

  getPhaseLabel() {
    switch (this.phase) {
      case FightPhase.RUN:
        return "Fish is running — ease off!";
      case FightPhase.DIVE:
        return "Fish diving — let it tire";
      case FightPhase.SURGE:
        return "Surge — keep rod tip up";
      case FightPhase.THRASH:
        return "Thrashing — don't reel!";
      default:
        return "Fish tiring — reel now!";
    }
  }
}

/** How many nibbles before a bite based on bait style. */
export function nibbleCountForBait(bait) {
  const style = nibbleStyleForBait(bait);
  if (style === "strike") return 0;
  if (style === "slow") return 1 + Math.floor(Math.random() * 2);
  if (style === "normal") return 2 + Math.floor(Math.random() * 2);
  return 2 + Math.floor(Math.random() * 3);
}

/** Tension sweet-zone helpers (matches Real VR Fishing style drag control). */
export const TENSION = {
  SWEET_LOW: 0.28,
  SWEET_HIGH: 0.7,
  WARNING: 0.82,
  SNAP: 0.94,
  LOOSE: 0.1,
};

export function tensionZone(tension, rod = null, options = {}) {
  const sweet = rod ? getSweetZone(rod.level, options) : { low: TENSION.SWEET_LOW, high: TENSION.SWEET_HIGH };
  const snap = rod ? getSnapThreshold(rod.level) : TENSION.SNAP;
  if (tension >= snap) return "snap";
  if (tension >= TENSION.WARNING) return "warning";
  if (tension >= sweet.low && tension <= sweet.high) return "sweet";
  if (tension < TENSION.LOOSE) return "loose";
  return "high";
}
