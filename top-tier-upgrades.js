(() => {
  const key = "kaden-fishing-quest-premium-v1";
  const state = JSON.parse(localStorage.getItem(key) || "null") || {
    license: "Dock Scout",
    ecology: 24,
    mastery: 18,
    exploration: 22,
    trophyMarks: 0,
    expedition: "Sunrise Dock",
    fishdex: 4,
    boat: "Starter Skiff",
    event: "Daily Trip",
    serviceStatus: "Offline tournament queue ready",
  };
  const expeditions = ["Sunrise Dock", "Cypress Cove", "Lantern Marsh", "Moonlit Deep"];
  const boats = ["Starter Skiff", "Cove Cruiser", "Tournament Bass Boat", "Legend Pontoon"];
  const events = ["Daily Trip", "Boss Hunt", "Clan Arena", "Grand Tournament"];
  const save = () => localStorage.setItem(key, JSON.stringify(state));
  const clamp = (value) => Math.max(0, Math.min(100, value));

  function rank() {
    const total = state.ecology + state.mastery + state.exploration;
    if (total > 240) return "Lake Legend";
    if (total > 150) return "Trophy Captain";
    if (total > 90) return "Cove Explorer";
    return "Dock Scout";
  }

  function improve(field) {
    state[field] = clamp(state[field] + 13);
    state.trophyMarks += 1;
    state.license = rank();
    state.expedition = expeditions[state.trophyMarks % expeditions.length];
    state.fishdex = Math.min(48, state.fishdex + 2);
    state.boat = boats[state.trophyMarks % boats.length];
    state.event = events[state.trophyMarks % events.length];
    state.serviceStatus = `Queued ${state.event} catch data for future /api/fishing-quest/progress sync`;
    save();
    render();
  }

  function render() {
    const app = document.querySelector("#app");
    if (!app) return;
    let panel = document.querySelector("#anglerPremium");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "anglerPremium";
      panel.className = "angler-premium";
      app.insertAdjacentElement("afterend", panel);
    }

    panel.innerHTML = `
      <div class="angler-premium__head">
        <div>
          <h2>Expedition Board</h2>
          <p>Adds a premium fishing loop: habitat mastery, trophy routing, and lake expeditions that change what players chase next.</p>
        </div>
        <span class="angler-license">${state.license} · ${state.expedition}</span>
      </div>
      <div class="angler-grid">
        <article class="angler-card">
          <h3>Habitat Clues</h3>
          <p>Teaches where rare fish live so the lake feels designed instead of random.</p>
          <div class="angler-meter"><span style="width:${state.ecology}%"></span></div>
          <button data-improve="ecology">Study Habitat</button>
        </article>
        <article class="angler-card">
          <h3>Reel Mastery</h3>
          <p>Progression around cast timing, tension windows, and better catches.</p>
          <div class="angler-meter"><span style="width:${state.mastery}%"></span></div>
          <button data-improve="mastery">Practice Reel</button>
        </article>
        <article class="angler-card">
          <h3>Lake Expeditions</h3>
          <p>Rotating zones give the game stronger replay goals and premium lake-pack hooks.</p>
          <div class="angler-meter"><span style="width:${state.exploration}%"></span></div>
          <button data-improve="exploration">Scout Zone</button>
        </article>
        <article class="angler-card">
          <h3>FishDex & Rarity</h3>
          <p>${state.fishdex}/48 species tracked with common, rare, trophy, and boss-fish goals.</p>
          <div class="angler-meter"><span style="width:${Math.min(100, state.fishdex * 2)}%"></span></div>
          <button data-improve="ecology">Log Catch</button>
        </article>
        <article class="angler-card">
          <h3>Boat & Lure Loadouts</h3>
          <p>${state.boat} supports lure choice, cast bonus, and fishery-specific upgrades.</p>
          <div class="angler-meter"><span style="width:${Math.min(100, state.mastery + 18)}%"></span></div>
          <button data-improve="mastery">Upgrade Boat</button>
        </article>
        <article class="angler-card">
          <h3>Live Competition</h3>
          <p>${state.event} creates duels, clan scores, tournaments, and daily reward pressure.</p>
          <div class="angler-meter"><span style="width:${Math.min(100, state.exploration + 20)}%"></span></div>
          <button data-improve="exploration">Enter Event</button>
        </article>
        <article class="angler-card">
          <h3>Backend Contract</h3>
          <p>${state.serviceStatus}. Ready fields: FishDex, boat, lure path, event, trophy marks, and lake zone.</p>
          <div class="angler-meter"><span style="width:${Math.min(100, 28 + state.trophyMarks * 6)}%"></span></div>
          <button data-improve="mastery">Queue Sync</button>
        </article>
      </div>
    `;

    panel.querySelectorAll("[data-improve]").forEach((button) => {
      button.addEventListener("click", () => improve(button.dataset.improve));
    });
  }

  render();
})();
