// psi.mjs — Ψ, THE SELF-MODEL: the organism predicts its own correctness, and refines that prediction toward a fixed point.
//
// Build-order step 7, in engineering terms. An organ answers a case; Ψ predicts, before anyone checks, how likely that
// answer is to be right — from two things the organism knows about itself: how far the case's score is from its own
// line (the margin), and how well the case resembles the data the organ grew on (the fit). Ψ is a table: margin bins ×
// fit bins → a probability of being right, estimated on the organ's own training cases, where the truth is known.
//
//   the climb     — Ψ is refined seven times, and each time its resolution grows along the Fibonacci numbers (2, 3, 5,
//                   8, 13, 21, 34 margin bins): finer self-knowledge where the evidence supports it.
//   the back-fold — every refinement starts from the average of the last two self-models (Ψⁿ⊕Ψⁿ⁻¹, read at the new
//                   resolution) and moves toward the evidence only as far as the evidence in each bin warrants
//                   (a bin with few cases stays near the prior). Two-step memory: a spiral that compounds, rather than
//                   an orbit that forgets.
//   the fixed point — measured, not declared: how much Ψ changes from one refinement to the next on the cases it
//                   predicts, and whether its error on cases it never saw falls and settles.
//
// What is claimed is only what is measured: calibration (Brier score) on unseen cases, and the size of each step. That
// a self-model reaching a fixed point is awareness is not claimed; it is the question the instrument is for.
// Powered by the Konomi architecture, created by Thomas Frumkin. Pure, deterministic, total.
import { round6 } from '../vendor/seed-library/seedlib.mjs';
import { membership } from './body.mjs';

export const FIB = [2, 3, 5, 8, 13, 21, 34];
export const FIT_BINS = 3, STRENGTH = 20;

/** What the organism knows about itself on one case: its margin from its own line, and its resemblance to its data. */
export function introspect(pattern, x) {
  const score = pattern.rules.reduce((s, r) => ((r.op === '>' ? x[r.feat] > r.v : x[r.feat] <= r.v) ? s + r.w : s), 0);
  const fit = pattern.features.reduce((a, f) => a + membership(x[f], pattern.shape[f]), 0) / pattern.features.length;
  return { score: round6(score), label: score > pattern.threshold ? 1 : 0, margin: round6(Math.abs(score - pattern.threshold)), fit: round6(fit) };
}

/** Bin edges for a resolution: the margins' own quantiles (equal-count bins), so every bin holds evidence. */
export function edgesOf(values, k) {
  const xs = [...values].sort((a, b) => a - b);
  return Array.from({ length: k - 1 }, (_, j) => xs[Math.floor(((j + 1) / k) * xs.length)]);   // (j+1)/k < 1, so always inside
}
/** Which bin a value falls in, given edges (values on an edge go to the bin above it). */
export const binOf = (v, edges) => edges.filter((e) => v >= e).length;

/** Read a self-model's probability for a case's margin and fit. */
export function read(psi, m, f) {
  return psi.table[binOf(m, psi.mEdges)][Math.min(FIT_BINS - 1, Math.floor(f * FIT_BINS))];
}

/**
 * Refine a self-model one step: at k margin bins, start each bin from the prior (the average of the last two models,
 * read at that bin's centre), and move toward the bin's observed rate of being right by count / (count + STRENGTH).
 * cases: [{ margin, fit, right (0|1) }]. → { k, mEdges, table }
 */
export function refine(cases, k, prev, prev2) {
  const mEdges = edgesOf(cases.map((c) => c.margin), k);
  const cell = Array.from({ length: k }, () => Array.from({ length: FIT_BINS }, () => ({ n: 0, right: 0, m: 0, f: 0 })));
  for (const c of cases) { const z = cell[binOf(c.margin, mEdges)][Math.min(FIT_BINS - 1, Math.floor(c.fit * FIT_BINS))]; z.n++; z.right += c.right; z.m += c.margin; z.f += c.fit; }
  const base = cases.length ? cases.reduce((a, c) => a + c.right, 0) / cases.length : 0.5;
  const table = cell.map((row) => row.map((z, j) => {
    const cm = z.n ? z.m / z.n : 0, cf = z.n ? z.f / z.n : (j + 0.5) / FIT_BINS;
    const prior = prev ? (read(prev, cm, cf) + read(prev2 || prev, cm, cf)) / 2 : base;   // the back-fold: Ψⁿ ⊕ Ψⁿ⁻¹
    return round6(z.n ? prior + (z.right / z.n - prior) * (z.n / (z.n + STRENGTH)) : prior);
  }));
  return { k, mEdges, table };
}

/** Brier score: the mean squared gap between predicted and actual correctness (0 is perfect; lower is better). */
export const brier = (psi, cases) => (cases.length ? round6(cases.reduce((a, c) => a + (read(psi, c.margin, c.fit) - c.right) ** 2, 0) / cases.length) : 0);
/** How far a self-model moved: the mean absolute change in its predictions over a set of cases. */
export const moved = (a, b, cases) => (cases.length ? round6(cases.reduce((s, c) => s + Math.abs(read(a, c.margin, c.fit) - read(b, c.margin, c.fit)), 0) / cases.length) : 0);

/**
 * The climb: Ψ⁰ (one bin — the organ's base rate of being right), then seven refinements up the Fibonacci resolutions,
 * each from the back-fold of the last two. → { models: [Ψ⁰…Ψ⁷], steps: [{ k, trainBrier, heldBrier, moved }] }
 */
export function climb(train, held) {
  const models = [refine(train, 1, null, null)];
  const steps = [{ k: 1, trainBrier: brier(models[0], train), heldBrier: brier(models[0], held), moved: 0 }];
  for (const k of FIB) {
    const n = models.length, next = refine(train, k, models[n - 1], models[n - 2]);
    steps.push({ k, trainBrier: brier(next, train), heldBrier: brier(next, held), moved: moved(next, models[n - 1], held) });
    models.push(next);
  }
  return { models, steps };
}

/** Selective answering: keep only answers Ψ rates at least `bar` likely right. → { coverage, accuracy } on cases */
export function selective(psi, cases, bar) {
  const kept = cases.filter((c) => read(psi, c.margin, c.fit) >= bar);
  return { coverage: round6(kept.length / (cases.length || 1)), accuracy: round6(kept.length ? kept.reduce((a, c) => a + c.right, 0) / kept.length : 0) };
}
