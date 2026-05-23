(() => {
  const key = "kaden-fishing-quest-v1";
  const state = JSON.parse(localStorage.getItem(key) || "null") || {
    fish: 0,
    coins: 25,
    rodLevel: 1,
    zone: "Lake Dock",
    quest: 0,
    book: [],
    castReady: true,
  };
  const save = () => localStorage.setItem(key, JSON.stringify(state));

  const toast = document.querySelector("#toast");
  const fishCount = document.querySelector("#fishCount");
  const coins = document.querySelector("#coins");
  const rod = document.querySelector("#rod");
  const bobber = document.querySelector("#bobber");
  const lastCatch = document.querySelector("#lastCatch");
  const questLog = document.querySelector(".quest-log");
  const cards = document.querySelector(".cards");

  document.head.insertAdjacentHTML("beforeend", `<style>
    .fish-tools,.fish-book{display:grid;gap:12px}.fish-tools{margin-top:16px}.fish-book .entry{background:rgba(255,255,255,.08);padding:10px 12px;border-radius:12px}
    .fish-tools select,.fish-tools button{font:inherit;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2)}
  </style>`);

  cards.insertAdjacentHTML("afterend", `
    <section class="quest-log fish-tools">
      <h2>Fishing Controls</h2>
      <select id="zoneSelect">
        <option>Lake Dock</option>
        <option>North Cove</option>
        <option>Deep Water</option>
      </select>
      <button id="reelBtn" type="button">Reel In</button>
      <div class="fish-book" id="fishBook"></div>
    </section>`);

  const catches = {
    "Lake Dock": ["1.8 lb Bluegill", "2.1 lb Bass", "3.0 lb Sunfish"],
    "North Cove": ["2.8 lb Trout", "3.6 lb Bass", "Rare Golden Carp"],
    "Deep Water": ["4.5 lb Catfish", "5.2 lb Bass", "6.0 lb Night Pike"],
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function render() {
    fishCount.textContent = `Fish ${state.fish}`;
    coins.textContent = `Coins ${state.coins}`;
    rod.textContent = `Rod Lvl ${state.rodLevel}`;
    lastCatch.textContent = state.book[0] || `Waiting for bite at ${state.zone}`;
    bobber.classList.toggle("cast", !state.castReady);
    questLog.innerHTML = `
      <h2>Daily Quest Progress</h2>
      <div class="quest"><span>Catch 3 lake fish</span><strong>${Math.min(state.quest, 3)}/3</strong></div>
      <div class="quest"><span>Visit North Cove</span><strong>${state.zone === "North Cove" ? "Done" : "Pending"}</strong></div>
      <div class="quest"><span>Upgrade your rod once</span><strong>${state.rodLevel > 1 ? "Done" : "Pending"}</strong></div>`;
    document.querySelector("#zoneSelect").value = state.zone;
    document.querySelector("#fishBook").innerHTML = state.book.length
      ? state.book.map((entry) => `<div class="entry">${entry}</div>`).join("")
      : `<div class="entry">No catches yet. Cast a line to start the fish book.</div>`;
    save();
  }

  document.querySelector("#zoneSelect").addEventListener("change", (event) => {
    state.zone = event.target.value;
    render();
    showToast(`Moved to ${state.zone}.`);
  });

  document.querySelector("#castBtn").addEventListener("click", () => {
    state.castReady = false;
    render();
    showToast("Line cast. Wait, then reel in.");
  });

  document.querySelector("#reelBtn").addEventListener("click", () => {
    if (state.castReady) {
      showToast("Cast your line first.");
      return;
    }
    const zoneCatches = catches[state.zone];
    const catchItem = zoneCatches[(state.fish + state.rodLevel) % zoneCatches.length];
    state.fish += 1;
    state.coins += 10 + state.rodLevel * 2;
    state.quest += 1;
    state.book.unshift(`${catchItem} • ${state.zone}`);
    state.book = state.book.slice(0, 8);
    state.castReady = true;
    render();
    showToast(`Caught ${catchItem}.`);
  });

  document.querySelector("#upgradeBtn").addEventListener("click", () => {
    if (state.coins < 25) {
      showToast("Need 25 coins to upgrade the rod.");
      return;
    }
    state.coins -= 25;
    state.rodLevel += 1;
    render();
    showToast(`Rod upgraded to level ${state.rodLevel}.`);
  });

  render();
})();
