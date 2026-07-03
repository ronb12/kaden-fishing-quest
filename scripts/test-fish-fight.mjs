import { FishFightAI, FightPhase, tensionZone, TENSION, nibbleCountForBait } from "../js/fish-fight.js";

function assert(name, cond) {
  if (!cond) {
    console.error("FAIL:", name);
    process.exitCode = 1;
  } else {
    console.log("ok:", name);
  }
}

const ai = new FishFightAI();
ai.reset({ rarity: "rare", name: "Trout" });
let tension = 0.35;
for (let i = 0; i < 120; i++) {
  const step = ai.update(0.05, true, 0.8);
  tension += step.tensionDelta;
  tension = Math.max(0, Math.min(1, tension));
}
assert("fight AI runs", Number.isFinite(tension));
assert("fight produces phases", ai.phase !== undefined);
assert("tension sweet zone", tensionZone(0.45) === "sweet");
assert("tension warning", tensionZone(0.85) === "warning");
assert("nibble count", nibbleCountForBait({ meshType: "worm", nibbleStyle: "frequent" }) >= 2);
assert("strike lure no nibbles", nibbleCountForBait({ meshType: "spinner", nibbleStyle: "strike" }) === 0);
assert("spinner strike style", nibbleCountForBait({ presentation: "lure", nibbleStyle: "strike" }) === 0);
assert("tired phase exists", Object.values(FightPhase).includes("tired"));
