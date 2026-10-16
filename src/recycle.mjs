// recycle.mjs — SELF-POWERING: completed computation is kept and reused, so the next step costs less.
//
// Build-order step 6, in engineering terms. Germination and evolution keep paying for the same work: every rule's
// threshold is a quantile of one feature over the same training rows, and the ribosome sorts that column afresh each
// time; an organ grown from the same recipe on the same data is grown again from nothing. A pool keeps what was done:
//
//   sorted columns — the first time a feature's column is sorted for a set of rows, the sort goes into the pool;
//                    every later quantile of that column over those rows is read from it. Thousands of sorts become
//                    one per (data, rows, feature).
//   germinations   — an organ grown from a recipe on a dataset is kept under the recipe and a digest of the dataset's
//                    content (its columns, labels and rows), so the same recipe on equal data — another organism,
//                    a child carrying an unchanged organ, a re-germination — is handed the finished result.
//
// The one rule: a recycled result is byte-for-byte the result fresh computation gives. The pool only skips work; it
// never changes an answer. Its counters (hits, misses) are the measurement — deterministic, so CI reproduces them.
// Energy is not measured here (there is no meter on this machine); what is measured is the work not repeated.
// The fold-cycle idea (completion releases state that powers the next step) is Simon's spec in this estate; the
// quantile and germination it reuses are seed-library's (sjgant80-hub), vendored unchanged. Powered by the Konomi
// architecture, created by Thomas Frumkin.
import { germinate as express, fires, auc, round6, MAXRULES, QGRID, WGRID } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex, sha256Bytes, toHexStr } from '../vendor/seed-library/sha256.mjs';
import { stable } from './germinate.mjs';

/**
 * A pool. cap: how many germinations it keeps (0 keeps nothing — every request is computed, and counted, which is how
 * the work done without recycling is measured on the same code path). → the pool's methods and its counters
 */
export function pool({ cap = 4096 } = {}) {
  const columns = new WeakMap(), digests = new WeakMap(), grown = new Map();
  const n = { sortHits: 0, sortMisses: 0, growHits: 0, growMisses: 0 };
  const keep = cap > 0;

  /** a column's digest, kept per column array */
  const colDigest = (col) => { let d = digests.get(col); if (!d) { d = toHexStr(sha256Bytes(new Uint8Array(col.buffer, col.byteOffset, col.byteLength))); digests.set(col, d); } return d; };
  /** a dataset's content digest: its columns, labels and rows */
  const dataDigest = (ds) => sha256Hex(stable({ f: ds.features, c: ds.features.map((f) => colDigest(ds.cols[f])), y: colDigest(ds.y), t: ds.trainRows, h: ds.heldRows }));

  return {
    stats: () => ({ ...n }),
    /** a feature's values over rows, sorted ascending — sorted once per (columns, rows, feature) */
    sorted(dataset, rows, feat) {
      let byRows = columns.get(dataset.cols);
      if (!byRows) { byRows = new WeakMap(); columns.set(dataset.cols, byRows); }
      let byFeat = byRows.get(rows);
      if (!byFeat) { byFeat = new Map(); byRows.set(rows, byFeat); }
      const hit = keep && byFeat.get(feat);
      if (hit) { n.sortHits++; return hit; }
      n.sortMisses++;
      const xs = Float64Array.from(rows, (i) => dataset.cols[feat][i]).sort();
      if (keep) byFeat.set(feat, xs);
      return xs;
    },
    /** seed-library's germinate, recycled: the same recipe on equal data is the same finished result */
    germinate(dataset, recipe) {
      if (!dataset || !dataset.ok || !dataset.cols) return express(dataset, recipe);
      const key = recipe + '|' + dataDigest(dataset), hit = keep && grown.get(key);
      if (hit) { n.growHits++; return hit; }
      n.growMisses++;
      const g = express(dataset, recipe);
      if (keep) { if (grown.size >= cap) grown.delete(grown.keys().next().value); grown.set(key, g); }   // a refusal is deterministic too
      return g;
    },
  };
}

/** seed-library's quantile, read from the pool's sorted column. */
export function quantile(p, dataset, feat, rows, q) {
  const xs = p.sorted(dataset, rows, feat);
  if (!xs.length) return 0;
  return xs[Math.min(xs.length - 1, Math.max(0, Math.floor(q * (xs.length - 1))))];
}

/** seed-library's fit, with every threshold read from the pool. Byte-for-byte the scorecard fit() gives. */
export function fit(p, dataset, rows, genome) {
  const feats = dataset.features, nf = feats.length;
  const base = rows.length ? rows.reduce((a, i) => a + dataset.y[i], 0) / rows.length : 0;
  const rules = [];
  for (const r of Array.from({ length: MAXRULES }, (_, k) => k)) {
    if (!((genome.on >> r) & 1)) continue;
    const feat = feats[genome['f' + r] % nf];
    rules.push({ feat, op: genome['d' + r] & 1 ? '>' : '<=', v: round6(quantile(p, dataset, feat, rows, QGRID[genome['q' + r] % QGRID.length])), w: WGRID[genome['w' + r] % WGRID.length] });
  }
  return { genome, base: round6(base), rules };
}

/** seed-library's assess (fit on the rest, AUC on the held slice), recycled — for evolve()'s opts.assess. */
export function assessWith(p) {
  return (dataset, inner, genome) => {
    const card = fit(p, dataset, inner.rest, genome);
    return auc(inner.held.map((i) => card.rules.reduce((s, r) => (fires(r, dataset.cols[r.feat][i]) ? s + r.w : s), 0)), inner.held.map((i) => dataset.y[i]));
  };
}
