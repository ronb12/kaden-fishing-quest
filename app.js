(() => {
  const key = "kaden-fishing-quest-v2";
  const catches = {
    "Lake Dock": ["1.8 lb Bluegill", "2.1 lb Bass", "3.0 lb Sunfish"],
    "North Cove": ["2.8 lb Trout", "3.6 lb Bass", "Rare Golden Carp"],
    "Deep Water": ["4.5 lb Catfish", "5.2 lb Bass", "6.0 lb Night Pike"],
  };
  const gearCosts = {
    rod: 25,
    boat: 40,
    bait: 18,
  };
  const state = JSON.parse(localStorage.getItem(key) || "null") || {
    fish: 0,
    coins: 25,
    rodLevel: 1,
    zone: "Lake Dock",
    quest: 0,
    book: [],
    castReady: true,
    boatLevel: 1,
    baitKit: 1,
    activeTab: "camp",
  };
  const save = () => localStorage.setItem(key, JSON.stringify(state));

  const toast = document.querySelector("#toast");
  const fishCount = document.querySelector("#fishCount");
  const coins = document.querySelector("#coins");
  const rod = document.querySelector("#rod");
  const bobber = document.querySelector("#bobber");
  const lastCatch = document.querySelector("#lastCatch");
  const zoneTag = document.querySelector("#zoneTag");
  const app = document.querySelector("#app");
  const tabs = [...document.querySelectorAll("[data-tab]")];

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function questRows() {
    return [
      ["Catch 3 lake fish", `${Math.min(state.quest, 3)}/3`],
      ["Visit North Cove", state.zone === "North Cove" ? "Done" : "Pending"],
      ["Upgrade your rod once", state.rodLevel > 1 ? "Done" : "Pending"],
    ];
  }

  function renderCamp() {
    return `
      <div class="split-layout">
        <article class="panel-card">
          <h2>Camp Overview</h2>
          <p>The dock is your reset point before each run. Pick your lake zone, check today's goals, and decide whether to grind for fish count or save coins for gear.</p>
          <div class="detail-grid">
            <div class="entry metric">
              <strong>Fish Logged</strong>
              <span class="metric-value">${state.fish}</span>
              <div class="tiny">Across all lake trips</div>
            </div>
            <div class="entry metric">
              <strong>Boat Level</strong>
              <span class="metric-value">${state.boatLevel}</span>
              <div class="tiny">Unlocks deeper water runs</div>
            </div>
            <div class="entry metric">
              <strong>Coin Stash</strong>
              <span class="metric-value">${state.coins}</span>
              <div class="tiny">Spend on rods, bait, and boats</div>
            </div>
          </div>
        </article>
        <article class="panel-card">
          <h2>Quest Board</h2>
          <div class="mini-list">
            ${questRows().map(([label, value]) => `<div class="quest"><span>${label}</span><strong>${value}</strong></div>`).join("")}
          </div>
        </article>
      </div>
    `;
  }

  function renderCast() {
    return `
      <div class="split-layout">
        <article class="panel-card">
          <h2>Fishing Run</h2>
          <p>Switch zones, cast from the active dock, and reel when the bite hits. Higher rod and bait levels improve the value of each catch.</p>
          <div class="control-row">
            <select id="zoneSelect">
              <option ${state.zone === "Lake Dock" ? "selected" : ""}>Lake Dock</option>
              <option ${state.zone === "North Cove" ? "selected" : ""}>North Cove</option>
              <option ${state.zone === "Deep Water" ? "selected" : ""}>Deep Water</option>
            </select>
            <button id="reelBtn" type="button">Reel In</button>
          </div>
          <div class="mini-list">
            <div class="entry"><strong>Current Zone</strong><div class="tiny">${state.zone}</div></div>
            <div class="entry"><strong>Cast Status</strong><div class="tiny">${state.castReady ? "Ready to cast" : "Line is in the water"}</div></div>
          </div>
        </article>
        <article class="panel-card">
          <h2>Lake Notes</h2>
          <div class="mini-list">
            ${catches[state.zone].map((item) => `<div class="entry"><strong>${item}</strong><div class="tiny">Possible around ${state.zone}</div></div>`).join("")}
          </div>
        </article>
      </div>
    `;
  }

  function renderCodex() {
    return `
      <div class="split-layout">
        <article class="panel-card">
          <h2>Fish Codex</h2>
          <p>Your latest catches stay here, organized like a running family-friendly field journal instead of disappearing into one stats strip.</p>
          <div class="mini-list">
            ${state.book.length
              ? state.book.map((entry) => `<div class="entry"><strong>${entry}</strong><div class="tiny">Logged in the adventure codex</div></div>`).join("")
              : `<div class="empty-card">No catches yet. Cast a line to start the codex.</div>`}
          </div>
        </article>
        <article class="panel-card">
          <h2>Lake Targets</h2>
          <div class="mini-list">
            <div class="entry"><strong>Lake Dock</strong><div class="tiny">Bluegill, Bass, Sunfish</div></div>
            <div class="entry"><strong>North Cove</strong><div class="tiny">Trout, Bass, Golden Carp</div></div>
            <div class="entry"><strong>Deep Water</strong><div class="tiny">Catfish, Night Pike, heavy Bass</div></div>
          </div>
        </article>
      </div>
    `;
  }

  function renderGear() {
    return `
      <div class="split-layout">
        <article class="panel-card">
          <h2>Gear Bench</h2>
          <p>Upgrade each part of the fishing setup separately so progression feels like a real game system instead of a single upgrade button.</p>
          <div class="mini-list">
            <div class="entry"><strong>Rod Level ${state.rodLevel}</strong><div class="tiny">Upgrade cost: ${gearCosts.rod} coins</div></div>
            <div class="entry"><strong>Boat Level ${state.boatLevel}</strong><div class="tiny">Upgrade cost: ${gearCosts.boat} coins</div></div>
            <div class="entry"><strong>Bait Kit ${state.baitKit}</strong><div class="tiny">Upgrade cost: ${gearCosts.bait} coins</div></div>
          </div>
          <div class="actions gear-actions">
            <button type="button" data-upgrade="rod">Upgrade Rod</button>
            <button type="button" data-upgrade="boat">Upgrade Boat</button>
            <button type="button" data-upgrade="bait">Upgrade Bait</button>
          </div>
        </article>
        <article class="panel-card">
          <h2>Camp Notes</h2>
          <div class="mini-list">
            <div class="entry"><strong>Best Recent Catch</strong><div class="tiny">${state.book[0] || "No catches yet"}</div></div>
            <div class="entry"><strong>Deep Water Access</strong><div class="tiny">${state.boatLevel >= 2 ? "Boat is ready for longer runs" : "Upgrade the boat for stronger deep-water control"}</div></div>
          </div>
        </article>
      </div>
    `;
  }

  function renderApp() {
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.activeTab));
    if (state.activeTab === "camp") app.innerHTML = renderCamp();
    if (state.activeTab === "cast") app.innerHTML = renderCast();
    if (state.activeTab === "codex") app.innerHTML = renderCodex();
    if (state.activeTab === "gear") app.innerHTML = renderGear();

    const zoneSelect = document.querySelector("#zoneSelect");
    if (zoneSelect) {
      zoneSelect.addEventListener("change", (event) => {
        state.zone = event.target.value;
        render();
        showToast(`Moved to ${state.zone}.`);
      });
    }

    const reelBtn = document.querySelector("#reelBtn");
    if (reelBtn) {
      reelBtn.addEventListener("click", reelIn);
    }

    document.querySelectorAll("[data-upgrade]").forEach((button) => {
      button.addEventListener("click", () => upgradeGear(button.dataset.upgrade));
    });
  }

  function render() {
    fishCount.textContent = `Fish ${state.fish}`;
    coins.textContent = `Coins ${state.coins}`;
    rod.textContent = `Rod Lvl ${state.rodLevel}`;
    lastCatch.textContent = state.book[0] || `Waiting for bite at ${state.zone}`;
    zoneTag.textContent = `Camp at ${state.zone}`;
    bobber.classList.toggle("cast", !state.castReady);
    renderApp();
    save();
  }

  document.querySelector("#castBtn").addEventListener("click", () => {
    state.castReady = false;
    state.activeTab = "cast";
    render();
    showToast("Line cast. Wait, then reel in.");
  });

  function reelIn() {
    if (state.castReady) {
      showToast("Cast your line first.");
      return;
    }
    const zoneCatches = catches[state.zone];
    const catchItem = zoneCatches[(state.fish + state.rodLevel + state.baitKit) % zoneCatches.length];
    state.fish += 1;
    state.coins += 10 + state.rodLevel * 2 + state.baitKit;
    state.quest += 1;
    state.book.unshift(`${catchItem} • ${state.zone}`);
    state.book = state.book.slice(0, 10);
    state.castReady = true;
    state.activeTab = "codex";
    render();
    showToast(`Caught ${catchItem}.`);
  }

  function upgradeGear(type) {
    const cost = gearCosts[type];
    if (state.coins < cost) {
      showToast(`Need ${cost} coins to upgrade ${type}.`);
      return;
    }
    state.coins -= cost;
    if (type === "rod") state.rodLevel += 1;
    if (type === "boat") state.boatLevel += 1;
    if (type === "bait") state.baitKit += 1;
    state.activeTab = "gear";
    render();
    showToast(`${type[0].toUpperCase()}${type.slice(1)} upgraded.`);
  }

  document.querySelector("#upgradeBtn").addEventListener("click", () => {
    upgradeGear("rod");
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      render();
    });
  });

  render();
})();
