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
 * K stratified folds of the given rows (seeded): each class shuffled and dealt round-robin into K parts. → [{ held, rest }]
 * — fold j holds part j out and fits on the rest.
 */
export function kfolds(dataset, rows, K, seed) {
  const r = rng(seed * 31 + 3), parts = Array.from({ length: K }, () => []);
  for (const cls of [1, 0]) {
    const group = rows.filter((i) => dataset.y[i] === cls);
    for (let i = group.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [group[i], group[j]] = [group[j], group[i]]; }
    group.forEach((row, at) => parts[at % K].push(row));
  }
  return parts.map((p) => { const s = new Set(p); return { held: [...s].sort((a, b) => a - b), rest: rows.filter((i) => !s.has(i)) }; });
}

/**
 * Evolve one organ recipe on a blind dataset. opts: { generations = 30, children = 8, seed = 1, k = 2, margin = MARGIN,
 * folds = 1, assess }. With one fold, fitness is the AUC on a validation third carved from training. With K ≥ 2 folds it is the
 * mean over K cross-validation folds, and a child is kept only if it beats the champion on EVERY fold (unanimous) and
 * on the mean by more than the margin — a gain one lucky slice cannot fake.
 * → { ok, champion (recipe), accepted: [{ gen, recipe, val, folds? }], trajectory: [{ gen, val, best, accepted, k }], evals }
 */
export function evolve(recipe, dataset, opts = {}) {
  try {
    const { generations = 30, children = 8, seed = 1, k: k0 = 2, margin = MARGIN, folds = 1, assess: score = assess } = opts || {};   // opts.assess: a recycled assess (recycle.mjs), the same numbers
    if (!dataset || !Array.isArray(dataset.trainRows) || !Array.isArray(dataset.heldRows)) return no('evolve needs a dataset');
    if (dataset.heldRows.length) return no('the evolver is never shown the held-out cases — pass blind(dataset)');
    const d = decodeSeed(recipe);
    if (!d.ok || !d.seed.genome) return no('the recipe is not a fixed seed the ribosome reads');
    if (!Number.isSafeInteger(generations) || generations < 1 || !Number.isSafeInteger(children) || children < 1) return no('generations and children are whole numbers from 1');
    if (!Number.isSafeInteger(folds) || folds < 1 || folds > 10) return no('folds is a whole number from 1 to 10');
    const parts = folds === 1 ? [splitRows(dataset, dataset.trainRows, 1 / 3, seed)] : kfolds(dataset, dataset.trainRows, folds, seed);
    if (!parts.every((p) => p.held.length && p.rest.length)) return no('too few training cases to carve a validation slice');
    const r = rng(seed * 104729 + 7);
    const write = (g) => encodeSeed({ domain: d.seed.domain, seed: d.seed.seed, genome: g });
    const fit = (g) => { const per = parts.map((p) => round6(score(dataset, p, g))); return { g, per, val: round6(per.reduce((a, x) => a + x, 0) / per.length) }; };
    const keep = (x) => (folds === 1 ? {} : { folds: x.per });
    let champ = fit(d.seed.genome), k = Math.min(K_MAX, Math.max(K_MIN, k0)), evals = 1;
    const accepted = [{ gen: 0, recipe: write(champ.g), val: champ.val, ...keep(champ) }], trajectory = [{ gen: 0, val: champ.val, best: champ.val, accepted: true, k }], recent = [];
    for (let gen = 1; gen <= generations; gen++) {
      let best = null;
      for (let c = 0; c < children; c++) {
        let g = champ.g;
        for (let m = 0; m < k; m++) g = mutateGenome(g, r);
        const x = fit(g);
        evals++;
        if (!best || x.val > best.val) best = x;
      }
      // the gain itself against the margin — and, across folds, on every one of them
      const won = best.val - champ.val > margin && best.per.every((v, j) => v > champ.per[j]);
      if (won) { champ = best; accepted.push({ gen, recipe: write(champ.g), val: champ.val, ...keep(champ) }); }
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
