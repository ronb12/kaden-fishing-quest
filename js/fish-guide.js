import { FISH_SPECIES, BAITS } from "./data.js";

/** Educational metadata keyed by species id — gameplay stats stay in FISH_SPECIES. */
export const FISH_PROFILES = {
  bluegill: {
    category: "Panfish",
    habitat: "Warm, weedy shallows near docks, lily pads, and submerged brush.",
    behavior: "Schools in small groups. Cautious nibblers that taste bait before committing.",
    fightStyle: "Short bursts and head shakes — easy on light line.",
    tip: "Use a worm or cricket under a bobber at Lake Dock. Let nibbles settle before hooking.",
    funFact: "Bluegill get their name from the blue gill flap behind their jaw.",
  },
  bass: {
    category: "Game fish",
    habitat: "Structure edges — docks, weed lines, drop-offs — in all three zones.",
    behavior: "Ambush predator. Strikes hard from cover; may follow lures before attacking.",
    fightStyle: "Powerful runs and surface jumps. Moderate fight on most gear.",
    tip: "Minnows and spinners work everywhere. Try a popper at dawn near the dock.",
    funFact: "Bass use their lateral line to sense vibration from lures and wounded prey.",
  },
  sunfish: {
    category: "Panfish",
    habitat: "Sunny shallows with gravel or sand bottoms at Lake Dock.",
    behavior: "Aggressive for its size — quick bites on small baits near the surface.",
    fightStyle: "Fast circling and fluttering. Great for beginners learning hook timing.",
    tip: "Grasshoppers and crickets on a float bait draw fast strikes from sunfish.",
    funFact: "Despite the name, sunfish are most active in warm, bright conditions.",
  },
  trout: {
    category: "Cold-water game fish",
    habitat: "Cooler, rocky North Cove water with current pockets and deeper holes.",
    behavior: "Cruises mid-depth. Inspects bait carefully; prefers natural presentations.",
    fightStyle: "Long runs along the cove wall. Keep steady tension — they shake hooks easily.",
    tip: "Live shiner or krill at mid depth. Match bait to the cove's cooler water.",
    funFact: "Trout have excellent vision and often refuse bait that looks unnatural.",
  },
  "golden-carp": {
    category: "Rough fish (trophy)",
    habitat: "Muddy bottom and submerged logs in North Cove's deeper pockets.",
    behavior: "Bottom feeder. Slow, deliberate approach — may mouth bait for a long time.",
    fightStyle: "Heavy, grinding pulls. Patient reeling wins; don't horse them on light line.",
    tip: "Dough balls or soft plastic on the bottom. Patience is key for this rare catch.",
    funFact: "Golden carp are prized for their color and size — a true cove trophy.",
  },
  catfish: {
    category: "Bottom feeder",
    habitat: "Deep Water mud flats, sunken timber, and the drop-off shelf.",
    behavior: "Nocturnal tendencies. Scents and bottom baits draw them from cover.",
    fightStyle: "Stubborn bulldog pulls with sudden surges toward structure.",
    tip: "Dough, soft plastic, or metal jig on the bottom. Upgrade line before Deep Water.",
    funFact: "Catfish taste with barbels on their chin — they find food in murky water.",
  },
  "night-pike": {
    category: "Predator",
    habitat: "Weedy Deep Water edges and shadowed channels near the drop-off.",
    behavior: "Explosive ambush strikes. Hits moving lures and live bait aggressively.",
    fightStyle: "Violent runs and head thrashing. Ease off during surges or line snaps.",
    tip: "Crankbaits and jigs with active rod work. Fight in the green zone only.",
    funFact: "Named for their preference for low-light hunting in deep, dark water.",
  },
  "lunker-bass": {
    category: "Legendary game fish",
    habitat: "The deepest channels of Deep Water — rarely leaves the abyss.",
    behavior: "Elusive trophy. Ignores most bait; responds to large, active presentations.",
    fightStyle: "Epic, multi-phase battle. Long runs, deep dives, and brutal surges.",
    tip: "Spinner, crankbait, or jig with max rod level. Only appears in Deep Water.",
    funFact: "Few anglers ever land one. Legend says it has ruled the lake for decades.",
  },
};

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

export function getFishProfile(speciesOrId) {
  const species = typeof speciesOrId === "string"
    ? FISH_SPECIES.find((f) => f.id === speciesOrId)
    : speciesOrId;
  if (!species) return null;
  const profile = FISH_PROFILES[species.id] || {};
  return { ...species, ...profile };
}

export function getBestBaitsForSpecies(speciesId, limit = 3) {
  const boosted = BAITS.filter((b) => b.speciesBoost.includes(speciesId));
  return boosted
    .sort((a, b) => {
      const aIdx = a.speciesBoost.indexOf(speciesId);
      const bIdx = b.speciesBoost.indexOf(speciesId);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return b.name.localeCompare(a.name);
    })
    .slice(0, limit);
}

export function sortSpeciesForDisplay(list = FISH_SPECIES) {
  return [...list].sort((a, b) => {
    const rDiff = (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);
    if (rDiff !== 0) return rDiff;
    return a.name.localeCompare(b.name);
  });
}

function rarityLabel(rarity) {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function colorHex(species) {
  return `#${(species.color ?? 0x4a90c4).toString(16).padStart(6, "0")}`;
}

function baitChips(speciesId) {
  const baits = getBestBaitsForSpecies(speciesId);
  if (!baits.length) return "";
  return baits
    .map((b) => `<span class="fish-bait-chip" title="${b.description}">${b.icon} ${b.name}</span>`)
    .join("");
}

function zoneChips(zones) {
  return zones.map((z) => `<span class="fish-zone-chip">${z}</span>`).join("");
}

function fishDetailBody(species, caught = null) {
  const profile = getFishProfile(species);
  const [minW, maxW] = profile.weight;
  const locked = !caught;

  return `
    <div class="fish-detail-grid">
      <div class="fish-detail-block">
        <h5>Habitat</h5>
        <p>${profile.habitat}</p>
      </div>
      <div class="fish-detail-block">
        <h5>Behavior</h5>
        <p>${profile.behavior}</p>
      </div>
      <div class="fish-detail-block">
        <h5>Fight style</h5>
        <p>${profile.fightStyle}</p>
      </div>
      <div class="fish-detail-block">
        <h5>Angler tip</h5>
        <p class="fish-tip">${profile.tip}</p>
      </div>
      ${profile.funFact ? `
      <div class="fish-detail-block fish-fun-fact">
        <h5>Did you know?</h5>
        <p>${profile.funFact}</p>
      </div>` : ""}
    </div>
    <div class="fish-meta-row">
      <span><strong>Weight range:</strong> ${minW}–${maxW} lb</span>
      <span><strong>Value:</strong> ~${profile.value}c base</span>
      ${caught ? `<span><strong>Your best:</strong> ${caught.bestWeight} lb</span>` : ""}
    </div>
    <div class="fish-chips-row">
      <span class="fish-chips-label">Zones:</span> ${zoneChips(profile.zones)}
    </div>
    <div class="fish-chips-row">
      <span class="fish-chips-label">Best baits:</span> ${baitChips(profile.id)}
    </div>
    ${locked ? '<p class="fish-locked-hint">Catch this species to log it in your codex.</p>' : ""}
  `;
}

function fishSwatch(species, dimmed = false) {
  const hex = colorHex(species);
  return `
    <span class="fish-swatch ${dimmed ? "locked" : ""}" style="--fish-color: ${hex}" aria-hidden="true">
      <span class="fish-swatch-body"></span>
      <span class="fish-swatch-tail"></span>
    </span>
  `;
}

export function renderFishCard(species, caught = null, { expandable = true, defaultOpen = false, preview = false } = {}) {
  const profile = getFishProfile(species);
  const locked = !caught && !preview;
  const openClass = defaultOpen ? " open" : "";
  const expandId = `fish-detail-${profile.id}`;

  const header = locked
    ? `<strong class="fish-name-locked">???</strong>
       <span class="fish-subtitle">${rarityLabel(profile.rarity)} · ${profile.category} · Not yet caught</span>`
    : preview
    ? `<strong>${profile.name}</strong>
       <span class="fish-subtitle">${rarityLabel(profile.rarity)} · ${profile.category}</span>`
    : `<strong>${profile.name}</strong>
       <span class="fish-subtitle">${caught.count} caught · Best ${caught.bestWeight} lb · ${rarityLabel(profile.rarity)}</span>`;

  const summary = locked
    ? `<p class="fish-teaser">A ${profile.rarity} ${profile.category?.toLowerCase() || "fish"} lurks in ${profile.zones.join(", ")}.</p>`
    : `<p class="fish-teaser">${profile.habitat}</p>`;

  const toggle = expandable
    ? `<button type="button" class="fish-expand-btn" aria-expanded="${defaultOpen}" aria-controls="${expandId}" data-fish-toggle="${profile.id}">
         <span class="fish-expand-label">${defaultOpen ? "Hide" : "Learn more"}</span>
       </button>`
    : "";

  return `
    <article class="fish-card rarity-${profile.rarity} ${locked ? "locked" : "caught"}${openClass}" data-fish-id="${profile.id}">
      <div class="fish-card-header">
        ${fishSwatch(profile, locked)}
        <div class="fish-card-title">
          ${header}
        </div>
      </div>
      ${summary}
      ${toggle}
      ${expandable ? `<div class="fish-detail-panel" id="${expandId}">${fishDetailBody(profile, caught)}</div>` : ""}
    </article>
  `;
}

export function renderCodexHTML(state) {
  const discovered = Object.keys(state.codex).length;
  const total = FISH_SPECIES.length;
  const sorted = sortSpeciesForDisplay();

  const cards = sorted
    .map((species) => renderFishCard(species, state.codex[species.id] || null))
    .join("");

  return `
    <div class="codex-header">
      <p class="codex-progress"><strong>${discovered} / ${total}</strong> species discovered</p>
      <p class="help-tip">Expand any entry to learn habitat, behavior, and bait tips. Uncaught fish show hints only.</p>
    </div>
    <div class="fish-card-list">${cards}</div>
  `;
}

export function renderFishFieldGuideHTML() {
  const byZone = {
    "Lake Dock": [],
    "North Cove": [],
    "Deep Water": [],
  };

  for (const species of sortSpeciesForDisplay()) {
    for (const zone of species.zones) {
      if (byZone[zone]) byZone[zone].push(species);
    }
  }

  const zoneSections = Object.entries(byZone)
    .map(([zone, fish]) => {
      if (!fish.length) return "";
      const unique = [...new Map(fish.map((f) => [f.id, f])).values()];
      return `
        <div class="fish-zone-section">
          <h4>${zone}</h4>
          <div class="fish-card-list compact">
            ${unique.map((s) => renderFishCard(s, null, { expandable: true, preview: true })).join("")}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <p>Learn what lives in each zone before you cast. Match bait and depth to target specific species.</p>
    <div class="fish-rarity-legend">
      <span class="legend-item rarity-common">Common</span>
      <span class="legend-item rarity-uncommon">Uncommon</span>
      <span class="legend-item rarity-rare">Rare</span>
      <span class="legend-item rarity-legendary">Legendary</span>
    </div>
    ${zoneSections}
    <p class="help-tip">Open the <strong>Codex</strong> menu after catching fish to track personal records and discovery progress.</p>
  `;
}

export function getSpeciesCatchTip(speciesId) {
  const profile = getFishProfile(speciesId);
  if (!profile) return null;
  const baits = getBestBaitsForSpecies(speciesId, 2);
  const baitNames = baits.map((b) => b.name).join(" or ");
  return {
    id: `species_${speciesId}`,
    title: `New species: ${profile.name}!`,
    text: `${profile.category} · ${profile.fightStyle} Try ${baitNames || "matched bait"} in ${profile.zones[0]}. ${profile.tip}`,
  };
}

export function bindFishCardEvents(container) {
  container?.querySelectorAll("[data-fish-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".fish-card");
      const open = card?.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      const label = btn.querySelector(".fish-expand-label");
      if (label) label.textContent = open ? "Hide" : "Learn more";
    });
  });
}
