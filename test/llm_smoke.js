import { generateScript } from "../pipeline/scriptgen.js";
import { planScenes } from "../pipeline/sceneplanner.js";
import { adaptScenePrompt } from "../pipeline/promptAdapter.js";

const t0 = Date.now();
const idea = "Le pouvoir des petites habitudes quotidiennes";

console.log("== script ==");
const script = await generateScript(idea, { durationSec: 25 });
console.log(JSON.stringify(script, null, 2));

console.log("== scenes ==");
const scenes = await planScenes(script.script, { durationSec: 25 });
console.log(JSON.stringify(scenes, null, 2));

console.log("== adapt scene 1 ==");
const adapted = await adaptScenePrompt(scenes[0], { idea, durationSec: 25, script: script.script, style: "cinematic" });
console.log(JSON.stringify(adapted, null, 2));

console.log(`\ndone in ${((Date.now()-t0)/1000).toFixed(1)}s`);
