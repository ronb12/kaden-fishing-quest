/** Fishing tutorial content, guided walkthrough steps, and contextual tips. */

export const GUIDED_STEPS = [
  {
    id: "welcome",
    title: "Welcome to Kaden Fishing Quest",
    body: "This lake has three fishing zones, a cabin campground, and dozens of species to discover. This short walkthrough teaches casting, hooking, and fighting fish.",
    advanceOn: null,
  },
  {
    id: "pool",
    title: "Find the Fishing Pool",
    body: "Look at the water in front of the dock. A glowing blue ring marks the active fishing pool — cast inside it for the best bites. Accurate casts land closer to the center and attract fish faster.",
    advanceOn: null,
  },
  {
    id: "bait",
    title: "Choose Your Bait",
    body: "Open the menu (M) and pick Bait. Float baits like Nightcrawler wait for nibbles. Lures need you to twitch the rod. Match bait depth to each zone for better odds.",
    advanceOn: null,
  },
  {
    id: "cast",
    title: "Make Your Cast",
    body: null, // filled per platform in getStepBody
    advanceOn: "cast",
  },
  {
    id: "waiting",
    title: "Wait and Watch",
    body: "After casting, watch the bobber and the water. You may see nibbles (bobber dips), a fish shadow circling below the surface, and a warning before a big bite. Lures need occasional rod motion to attract fish.",
    advanceOn: "nibble",
  },
  {
    id: "bite",
    title: "Set the Hook!",
    body: null,
    advanceOn: "hooked",
  },
  {
    id: "fight",
    title: "Fight the Fish",
    body: "Reel only when tension is in the green sweet zone. Ease off during runs and surges (yellow/red) or the line snaps. Crank hard when the fish tires — watch the phase label on screen.",
    advanceOn: "caught",
  },
  {
    id: "complete",
    title: "You're Ready!",
    body: "Catch fish to earn coins, fill your codex, and complete quests. Upgrade rod, boat, and bait kit in the menu. Re-open Guide anytime for tips. Tight lines!",
    advanceOn: null,
  },
];

export const GUIDE_SECTIONS = [
  {
    id: "basics",
    title: "Getting Started",
    icon: "🎣",
    content: `
      <p>Start at <strong>Lake Dock</strong> — calm shallows ideal for learning. Walk the boardwalk, cast into the glowing pool ring, and wait for bites.</p>
      <ul class="help-list">
        <li><strong>Coins</strong> — earned from every catch; spend on rod, boat, and bait upgrades</li>
        <li><strong>Codex</strong> — logs species, best weight, and rarity</li>
        <li><strong>Quests</strong> — bonus coin rewards for milestones</li>
        <li><strong>Zones</strong> — walk to gold rings or use menu to teleport (VR: left trigger on zone pad)</li>
      </ul>
    `,
  },
  {
    id: "casting",
    title: "Casting",
    icon: "🎯",
    content: `
      <p>Cast power affects distance. Aim at the fishing pool — casts near the center improve accuracy and bite speed.</p>
      <ul class="help-list">
        <li><strong>Desktop</strong> — Hold Space to charge, release to cast. Mouse aims direction.</li>
        <li><strong>VR</strong> — Pull rod back, then swing forward like a real cast (right hand).</li>
        <li><strong>Touch</strong> — Hold Cast button to charge, release to cast. Drag right side to aim.</li>
      </ul>
      <p class="help-tip">Better rods cast farther. Upgrade in Gear when you have coins.</p>
    `,
  },
  {
    id: "reading-water",
    title: "Reading the Water",
    icon: "🌊",
    content: `
      <ul class="help-list">
        <li><strong>Fishing pool ring</strong> — blue glow on the water; cast inside it</li>
        <li><strong>Bobber dips</strong> — nibbles mean a fish is tasting your bait</li>
        <li><strong>Fish shadow</strong> — a glowing fish circles underwater while waiting</li>
        <li><strong>Pre-bite warning</strong> — bobber pulls down; get ready to hook set</li>
        <li><strong>Strike window</strong> — hook quickly when "Fish on!" appears or you'll miss it</li>
      </ul>
      <p class="help-tip">Lures won't show bobber nibbles the same way — keep twitching the rod until a strike.</p>
    `,
  },
  {
    id: "bait",
    title: "Bait Guide",
    icon: "🪱",
    content: `
      <p>Each bait has a presentation style that changes how you fish:</p>
      <ul class="help-list">
        <li><strong>Float</strong> — bobber on surface; wait for nibbles then hook (worm, cricket, dough)</li>
        <li><strong>Bottom</strong> — sinks deep; good for catfish and carp</li>
        <li><strong>Lure</strong> — no bobber; twitch rod to build lure activity, then strike</li>
        <li><strong>Jig</strong> — vertical presentation for mid-depth species</li>
      </ul>
      <p>Match bait to zone depth. Lake Dock is shallow; Deep Water needs bottom or deep lures. Check zone affinity in the Bait menu.</p>
      <p class="help-tip">Hotkeys <strong>4–9, 0, -, =, \`</strong> quick-swap bait on desktop.</p>
    `,
  },
  {
    id: "fighting",
    title: "Hooking & Fighting",
    icon: "⚔️",
    content: `
      <h4>Tension zones</h4>
      <ul class="help-list">
        <li><strong>Green (sweet)</strong> — reel now! Best progress with lowest snap risk</li>
        <li><strong>Yellow (high)</strong> — ease off the reel; fish is pulling hard</li>
        <li><strong>Red (warning/snap)</strong> — stop reeling immediately or line breaks</li>
        <li><strong>Loose</strong> — reel in slowly; too slack and the fish shakes free</li>
      </ul>
      <h4>Fight phases</h4>
      <ul class="help-list">
        <li><strong>Tired</strong> — best time to reel</li>
        <li><strong>Run / Surge / Thrash</strong> — hold steady, do not reel</li>
        <li><strong>Dive</strong> — fish pulls down; ease tension</li>
      </ul>
      <p class="help-tip">Rare and legendary fish fight longer and snap line easier. Use a stronger rod.</p>
    `,
  },
  {
    id: "fish-guide",
    title: "Fish Field Guide",
    icon: "🐟",
    content: null, // rendered dynamically in ui.js
  },
  {
    id: "zones",
    title: "Zones & Fish",
    icon: "📍",
    content: `
      <ul class="help-list">
        <li><strong>Lake Dock</strong> — Bluegill, Sunfish, Bass (beginner, always available)</li>
        <li><strong>North Cove</strong> — Trout, Golden Carp, Bass (Boat Lvl 1 · walk or menu)</li>
        <li><strong>Deep Water</strong> — Catfish, Night Pike, Lunker Bass (Boat Lvl 2 skiff — board at dock)</li>
      </ul>
      <p>At <strong>Boat Lvl 2+</strong> your skiff appears beside the pier. Walk up and press <strong>E</strong> to board and pick a zone. Deep Water requires the skiff.</p>
      <p>Open the <strong>Fish Field Guide</strong> tab above for habitat, behavior, bait tips, and fight styles for every species.</p>
      <p>Visit the cabin campground via the boardwalk path. Inside, press <strong>E</strong> to interact with tackle, maps, and gear.</p>
    `,
  },
  {
    id: "vr",
    title: "VR Controls",
    icon: "🥽",
    content: `
      <ul class="help-list">
        <li><strong>Right hand</strong> — holds rod; pull back and swing to cast; jerk up to hook</li>
        <li><strong>Left hand</strong> — cranks reel in a circle when fighting fish</li>
        <li><strong>Left trigger on zone pad</strong> — teleport between zones</li>
        <li><strong>Left grip</strong> — open menu</li>
        <li><strong>Right trigger</strong> — hook set on bite (alternative to jerk)</li>
      </ul>
      <p class="help-tip">Watch the reel handle spin as you crank. Ease off when the fish runs.</p>
    `,
  },
  {
    id: "desktop",
    title: "Desktop Controls",
    icon: "🖥️",
    content: `
      <ul class="help-list">
        <li><strong>Click</strong> — lock mouse to look</li>
        <li><strong>WASD</strong> — move · walk to gold rings to change zones</li>
        <li><strong>Hold Space</strong> — charge cast · release to throw</li>
        <li><strong>Space on bite</strong> — hook set</li>
        <li><strong>Hold R</strong> — reel during fight</li>
        <li><strong>M</strong> menu · <strong>B</strong> bait · <strong>E</strong> interact in cabin</li>
        <li><strong>1 / 2 / 3</strong> — quick zone switch</li>
      </ul>
    `,
  },
  {
    id: "touch",
    title: "Touch / Mobile",
    icon: "📱",
    content: `
      <ul class="help-list">
        <li><strong>Drag right side</strong> — look and aim cast</li>
        <li><strong>Joystick</strong> — move</li>
        <li><strong>Hold Cast</strong> — charge power, release to cast</li>
        <li><strong>HOOK!</strong> button on bite · <strong>Hold Reel</strong> after hooking</li>
      </ul>
    `,
  },
  {
    id: "pro-tips",
    title: "Pro Tips",
    icon: "💡",
    content: `
      <ul class="help-list">
        <li>Cast to the center of the pool for faster bites</li>
        <li>Match bait depth to zone — check Bait menu descriptions</li>
        <li>Upgrade rod before boat for better fights and cast distance</li>
        <li>Complete quests early for easy coin boosts</li>
        <li>Legendary fish appear rarely in Deep Water — use strong line</li>
        <li>During lure fishing, move the rod or look around while waiting</li>
        <li>If line snaps, you reeled too hard in yellow/red tension</li>
        <li>If fish escapes on loose tension, wait for the "tired" phase</li>
        <li>Check the codex after each new species — expand entries for habitat and bait tips</li>
        <li>Use the Fish Field Guide (Guide menu) to plan which bait to bring to each zone</li>
      </ul>
    `,
  },
];

export const CONTEXTUAL_TIPS = {
  first_cast: {
    id: "first_cast",
    title: "Cast landed",
    text: "Watch the bobber. Nibbles dip it down; a fish shadow may circle below the surface.",
  },
  nibble: {
    id: "nibble",
    title: "Nibble!",
    text: "A fish is tasting your bait. Stay ready — a full bite can follow soon.",
  },
  preBite: {
    id: "preBite",
    title: "Something big nearby",
    text: "The bobber is pulling down. Get ready to set the hook!",
  },
  bite: {
    id: "bite",
    title: "Fish on!",
    text: "Hook now! You only have a few seconds before it gets away.",
  },
  hooked: {
    id: "hooked",
    title: "Hooked",
    text: "Reel in the green tension zone. Ease off when the bar turns yellow or red.",
  },
  tension_warning: {
    id: "tension_warning",
    title: "Line stress",
    text: "Tension is too high — stop reeling or the line will snap!",
  },
  tension_sweet: {
    id: "tension_sweet",
    title: "Sweet spot",
    text: "Green zone — reel now for best progress!",
  },
  phase_run: {
    id: "phase_run",
    title: "Fish run",
    text: "The fish is running — hold steady and stop reeling until it tires.",
  },
  phase_tired: {
    id: "phase_tired",
    title: "Fish tired",
    text: "Now's your chance — reel hard while tension stays green!",
  },
  caught: {
    id: "caught",
    title: "Nice catch!",
    text: "Coins added. New species unlock field-guide details in your codex. Cast again or check quests.",
  },
  failed_snap: {
    id: "failed_snap",
    title: "Line snapped",
    text: "You reeled too hard during high tension. Ease off in yellow/red zones.",
  },
  failed_escape: {
    id: "failed_escape",
    title: "Fish escaped",
    text: "The fish shook free. Reel only during tired phases with steady tension.",
  },
  lure_activity: {
    id: "lure_activity",
    title: "Work the lure",
    text: "Twitch the rod or move the camera — lures need action to attract fish.",
  },
};

const PLATFORM_CAST = {
  desktop: "Hold <strong>Space</strong> to charge your cast, then release while aiming at the pool with the mouse.",
  vr: "With the rod in your <strong>right hand</strong>, pull back and swing forward toward the pool.",
  touch: "Hold the <strong>Cast</strong> button to charge, then release while aiming with the right side of the screen.",
};

const PLATFORM_HOOK = {
  desktop: "When you see <strong>Fish on!</strong>, press <strong>Space</strong> immediately to set the hook.",
  vr: "When a fish bites, <strong>jerk the rod up</strong> or pull the right trigger to hook set.",
  touch: "Tap the <strong>HOOK!</strong> button as soon as it appears.",
};

export function getGuidedStepBody(step, platform = "desktop") {
  if (step.id === "cast") return PLATFORM_CAST[platform] || PLATFORM_CAST.desktop;
  if (step.id === "bite") return PLATFORM_HOOK[platform] || PLATFORM_HOOK.desktop;
  return step.body;
}

export function getAdvanceIndex(stepId) {
  return GUIDED_STEPS.findIndex((s) => s.id === stepId);
}

export function stepForTrigger(trigger, currentStep) {
  const step = GUIDED_STEPS[currentStep];
  if (!step) return currentStep;
  if (step.advanceOn === trigger) {
    return Math.min(GUIDED_STEPS.length - 1, currentStep + 1);
  }
  if (trigger === "bite" && step.id === "waiting") {
    return getAdvanceIndex("bite");
  }
  if (trigger === "cast" && step.id === "bait") {
    return getAdvanceIndex("cast");
  }
  return currentStep;
}
