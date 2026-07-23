// Print the states the REAL parser (app/src/lib/molstar/het.ts) produces for each example, and
// check them against _atom_site.
//
// Why this exists: the page makes claims about these lists in prose -- "six states in one bundle",
// "0.13 + 0.09 = 0.22" -- and nothing else checks them. tsc and next build do not read prose;
// check_examples.py measures geometry. This closes the gap for the thing the figures compute.
//
// Two kinds of list come out, and the difference is the point of the proposal:
//   stated       -- read from _pdbx_het_state; each number is the JOINT occupancy of a combination.
//   independent  -- the file states no joint, so the parser falls back to every combination the
//                   coexistence groups allow, weighted by the PRODUCT of the marginals. That is an
//                   assumption, not a record, and the page says so.
//
// Usage (needs the app's node_modules for molstar + the @/ path alias):
//   cd app && cp ../heterogeneity-proposal/scripts/check_states.mts ./__states.mts \
//     && npx --yes tsx ./__states.mts ; rm -f ./__states.mts
//
// Expected, as of the states+bundles rework:
//   7HHS_apo_bound          stated       3   apo .78 / bound+pose_1 .13 / bound+pose_2 .09
//   constructed_two_pocket  stated       6   one bundle; EDO1+EDO2 .25 is the majority species,
//                                            where independence would have predicted .15
//   5E1N_ca_site            independent  8   2 x 4, no joint known between the two stretches
//   5E1N_gln8_split         independent  6   3 x 2
//   5E1N_arg74_clash        independent  5   3 x 2 minus the one forbidden pairing
import fs from "fs";
import { createRequire } from "module";
import { parseHeterogeneity, type HetModel } from "@/lib/molstar/het";

const require = createRequire(import.meta.url);
const { CIF } = require("molstar/lib/mol-io/reader/cif");

// Resolved against cwd, which the usage note above fixes as `app/` -- the script is copied there
// to run, so import.meta.url would point at the copy rather than at this file.
const EX = `${process.cwd()}/public/examples/het/`;

const TOL = 0.005;
let fail = 0;

function problem(msg: string) {
  fail++;
  console.log(`   PROBLEM  ${msg}`);
}

// The two arithmetic claims a stated file makes about itself: the bundle is exhaustive (its states
// sum to 1), and it agrees with the coordinates (a network's marginal is the sum of the states
// containing it). Either one failing means the file contradicts _atom_site.
function checkStated(name: string, model: HetModel) {
  const byBundle = new Map<string, number>();
  for (const s of model.states) {
    if (s.probability == null) {
      problem(`${name}: state ${s.id} has no occupancy`);
      continue;
    }
    const b = s.bundleId ?? "(none)";
    byBundle.set(b, (byBundle.get(b) ?? 0) + s.probability);
  }
  for (const [b, sum] of byBundle) {
    if (Math.abs(sum - 1) > TOL) problem(`${name}: bundle ${b} sums to ${sum.toFixed(3)}, not 1.00`);
  }
  for (const n of model.networks) {
    if (n.occupancy == null) continue;
    let marginal = 0;
    for (const s of model.states) {
      if (s.networks.includes(n.id)) marginal += s.probability ?? 0;
    }
    if (Math.abs(marginal - n.occupancy) > TOL) {
      problem(
        `${name}: ${n.id} has marginal ${marginal.toFixed(3)} over the states but ` +
          `_atom_site.occupancy ${n.occupancy.toFixed(3)}`,
      );
    }
  }
}

async function run(name: string) {
  const text = fs.readFileSync(`${EX}${name}.cif`, "utf8");
  const parsed = await CIF.parse(text).run();
  if (parsed.isError) throw new Error(`${name}: ${parsed.message}`);
  const model = parseHeterogeneity(parsed.result);
  if (!model) {
    console.log(`\n${name}: NO MODEL`);
    return;
  }
  console.log(`\n${name} — ${model.states.length} state(s), ${model.stateSource}`);
  for (const s of model.states) {
    const p = s.probability == null ? "?" : s.probability.toFixed(3);
    const b = s.bundleId ? `[${s.bundleId}] ` : "";
    console.log(`   ${p}   ${b}${s.networks.join(" + ") || "(base only)"}`);
  }
  if (model.stateSource === "stated") checkStated(name, model);
}

for (const n of [
  "7HHS_apo_bound",
  "constructed_two_pocket",
  "5E1N_ca_site",
  "5E1N_gln8_split",
  "5E1N_arg74_clash",
]) {
  await run(n);
}

console.log(fail ? `\n${fail} PROBLEM(S)` : "\nevery stated bundle sums to 1 and matches _atom_site.");
process.exit(fail ? 1 : 0);
