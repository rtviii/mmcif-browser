// Print the legal states the REAL parser (app/src/lib/molstar/het.ts) enumerates for each example.
//
// Why this exists: the page makes claims about these lists in prose -- "the state list contains
// Ligand together with EDO2", "three states remain" -- and nothing else checks them. tsc and
// next build do not read prose; check_examples.py only measures geometry. This closes that gap
// for the one thing the figures actually compute.
//
// Usage (needs the app's node_modules for molstar + the @/ path alias):
//   cd app && cp ../heterogeneity-proposal/scripts/check_states.mts ./__states.mts \
//     && npx --yes tsx ./__states.mts ; rm -f ./__states.mts
//
// Expected, as of the Delta B rework:
//   7HHS_apo_bound              3   apo .78 / bound+pose_1 .13 / bound+pose_2 .09
//   constructed_two_pocket_flat 6   includes Ligand+EDO2 -- the false states the wrong parent admits
//   constructed_two_pocket      3   Ligand .50 / EDO1+EDO2 .30 / EDO1+EDO3 .20 -- the false ones gone
//   constructed_ncs_lock        4   .16/.24/.24/.36 -- `equal` ties the two numbers, NOT co-occurrence,
//                                   so the cartesian product is the correct reading
import fs from "fs";
import { createRequire } from "module";
import { parseHeterogeneity } from "@/lib/molstar/het";

const require = createRequire(import.meta.url);
const { CIF } = require("molstar/lib/mol-io/reader/cif");

// Resolved against cwd, which the usage note above fixes as `app/` -- the script is copied there
// to run, so import.meta.url would point at the copy rather than at this file.
const EX = `${process.cwd()}/public/examples/het/`;

async function run(name: string) {
  const text = fs.readFileSync(`${EX}${name}.cif`, "utf8");
  const parsed = await CIF.parse(text).run();
  if (parsed.isError) throw new Error(`${name}: ${parsed.message}`);
  const model = parseHeterogeneity(parsed.result);
  if (!model) {
    console.log(`\n${name}: NO MODEL`);
    return;
  }
  console.log(`\n${name} — ${model.states.length} legal state(s)`);
  for (const s of model.states) {
    const p = s.probability == null ? "?" : s.probability.toFixed(3);
    console.log(`   ${p}   ${s.networks.join(" + ") || "(base only)"}`);
  }
}

for (const n of [
  "7HHS_apo_bound",
  "constructed_two_pocket_flat",
  "constructed_two_pocket",
  "constructed_ncs_lock",
]) {
  await run(n);
}
