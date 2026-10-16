// evolve.mjs — μ + f: VARIATION AND SELECTION, blind to the cases it will be judged on.
//
// Build-order step 4. An organ's recipe varies (μ) and the fitter variant is kept (f) — but only on evidence the organ
// is allowed to see:
//
//   blind     — the evolver is never handed a held-out case. evolve() refuses any dataset that still holds one; the
//               caller passes blind(dataset), a copy with its held rows removed. It carves its own validation slice
//               from the training cases and selects on that alone.
//   μ         — a child is the champion's recipe with k single changes (a rule switched on or off; a rule's
//               measurement, quantile, side or weight changed — the ribosome's own mutation).
//   f         — each generation the best child replaces the champion only if it beats it on validation by MARGIN.
//   regulated — k, the size of a step, is not fixed: it follows Rechenberg's one-fifth success rule over the last
//               five generations — more than one in five accepted, the steps grow; fewer, they shrink (1 ≤ k ≤ 8).
//               The variation is regulated, never locked to a constant.
//   judged    — judge() is the only code here that reads held-out cases: it grows each accepted recipe on the full
//               data and reports the score on cases the evolver never saw. Whether the climb on validation is a
//               climb on the unseen is what is measured, and it can fail.
//
// Rechenberg's rule: I. Rechenberg, Evolutionsstrategie (1973). The ribosome, its mutation, split and AUC are
// seed-library's (sjgant80-hub), vendored unchanged. Powered by the Konomi architecture, created by Thomas Frumkin.
// Pure, deterministic (seeded), total.
import { decodeSeed, encodeSeed, splitRows, assess, mutateGenome, rng, round6, germinate as express } from '../vendor/seed-library/seedlib.mjs';

export const MARGIN = 0.002;
export const K_MIN = 1, K_MAX = 8, WINDOW = 5;
const no = (why) => ({ ok: false, why });

/** The same dataset with every held-out case removed — the only kind the evolver accepts. */
export const blind = (dataset) => ({ ...dataset, heldRows: [] });

/** The next step size: grow it when more than one in five recent generations were accepted, shrink it when fewer. */
export function nextStep(k, recent) {
  const rate = recent.length ? recent.filter(Boolean).length / recent.length : 0;
  return rate > 0.2 ? Math.min(K_MAX, k + 1) : rate < 0.2 ? Math.max(K_MIN, k - 1) : k;
}

/**
 * Evolve one organ recipe on a blind dataset. opts: { generations = 30, children = 8, seed = 1, k = 2, margin = MARGIN }.
 * → { ok, champion (recipe), accepted: [{ gen, recipe, val }], trajectory: [{ gen, val, best, accepted, k }], evals }
 */
export function evolve(recipe, dataset, opts = {}) {
  try {
    const { generations = 30, children = 8, seed = 1, k: k0 = 2, margin = MARGIN } = opts || {};
    if (!dataset || !Array.isArray(dataset.trainRows) || !Array.isArray(dataset.heldRows)) return no('evolve needs a dataset');
    if (dataset.heldRows.length) return no('the evolver is never shown the held-out cases — pass blind(dataset)');
    const d = decodeSeed(recipe);
    if (!d.ok || !d.seed.genome) return no('the recipe is not a fixed seed the ribosome reads');
    if (!Number.isSafeInteger(generations) || generations < 1 || !Number.isSafeInteger(children) || children < 1) return no('generations and children are whole numbers from 1');
    const inner = splitRows(dataset, dataset.trainRows, 1 / 3, seed);
    if (!inner.held.length || !inner.rest.length) return no('too few training cases to carve a validation slice');
    const r = rng(seed * 104729 + 7);
    const write = (g) => encodeSeed({ domain: d.seed.domain, seed: d.seed.seed, genome: g });
    let champ = { g: d.seed.genome, val: round6(assess(dataset, inner, d.seed.genome)) }, k = Math.min(K_MAX, Math.max(K_MIN, k0)), evals = 1;
    const accepted = [{ gen: 0, recipe: write(champ.g), val: champ.val }], trajectory = [{ gen: 0, val: champ.val, best: champ.val, accepted: true, k }], recent = [];
    for (let gen = 1; gen <= generations; gen++) {
      let best = null;
      for (let c = 0; c < children; c++) {
        let g = champ.g;
        for (let m = 0; m < k; m++) g = mutateGenome(g, r);
        const val = round6(assess(dataset, inner, g));
        evals++;
        if (!best || val > best.val) best = { g, val };
      }
      const won = best.val - champ.val > margin;   // the gain itself against the margin
      if (won) { champ = best; accepted.push({ gen, recipe: write(champ.g), val: champ.val }); }
      recent.push(won);
      if (recent.length > WINDOW) recent.shift();
      trajectory.push({ gen, val: champ.val, best: best.val, accepted: won, k });
      k = nextStep(k, recent);
    }
    return { ok: true, champion: accepted[accepted.length - 1].recipe, accepted, trajectory, evals };
  } catch { return no('the recipe could not be evolved'); }
}

/** The separate judge: each recipe grown on the FULL dataset, scored on the held-out cases the evolver never saw. */
export function judge(recipes, dataset) {
  return recipes.map((recipe) => {
    const g = express(dataset, recipe);
    return g.ok ? { recipe, heldAuc: g.heldAuc, heldAcc: g.heldAcc } : { recipe, error: g.error };
  });
}
