// src/baseline.mjs — the measuring stick: the classical models a data scientist would fit first on a table like this,
// so an organ's score means something. Pure, deterministic, no dependencies. Each fits on the rows it is given and
// nothing else, and scores any row; a higher score means "more likely a case".
//   · one feature alone — rank by a single measurement (the strongest one a buyer would try first)
//   · logistic regression — log(1 + x), standardised on the fitted rows, L2 (λ), Newton's method to convergence
//   · gradient-boosted trees — depth 2, splits at the fitted rows' quantiles, log-loss, shrinkage, L2 on leaves
// A dataset is the seed-library shape: { features, cols: { name: column }, y, … }.

const prep = (x) => Math.log1p(Math.max(0, x));   // counts, durations and rates are skewed and non-negative (−1 = missing → 0)

/** rank by one feature: the score is the measurement itself */
export function single(ds, feature) {
  if (!ds.features.includes(feature)) throw new Error('no feature ' + feature);
  return { kind: 'single', feature, score: (i) => ds.cols[feature][i] };
}

/** solve A x = b by Gaussian elimination with partial pivoting (A is small and, here, positive definite) */
export function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('singular system');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/** logistic regression on rows: Newton's method on the L2-penalised log-likelihood (the intercept is not penalised) */
export function logistic(ds, rows, { lambda = 1, iterations = 50, tol = 1e-10 } = {}) {
  const F = ds.features, d = F.length + 1;
  const mean = F.map((f) => rows.reduce((a, i) => a + prep(ds.cols[f][i]), 0) / rows.length);
  const sd = F.map((f, k) => (rows.every((i) => prep(ds.cols[f][i]) === prep(ds.cols[f][rows[0]])) ? 1   // a constant column is divided by 1, not by its rounding
    : Math.sqrt(rows.reduce((a, i) => a + (prep(ds.cols[f][i]) - mean[k]) ** 2, 0) / rows.length)));
  const xOf = (i) => [1, ...F.map((f, k) => (prep(ds.cols[f][i]) - mean[k]) / sd[k])];
  const X = rows.map(xOf), y = rows.map((i) => ds.y[i]);
  let w = new Array(d).fill(0), steps = 0;
  for (; steps < iterations; steps++) {
    const g = new Array(d).fill(0), H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let r = 0; r < X.length; r++) {
      const x = X[r], p = 1 / (1 + Math.exp(-x.reduce((a, v, k) => a + v * w[k], 0))), q = p * (1 - p);
      for (let a = 0; a < d; a++) { g[a] += (p - y[r]) * x[a]; for (let b = 0; b < d; b++) H[a][b] += q * x[a] * x[b]; }
    }
    for (let a = 1; a < d; a++) { g[a] += lambda * w[a]; H[a][a] += lambda; }
    const step = solve(H, g);
    w = w.map((v, k) => v - step[k]);
    if (Math.max(...step.map(Math.abs)) < tol) { steps++; break; }
  }
  return { kind: 'logistic', lambda, steps, weights: w, mean, sd, score: (i) => xOf(i).reduce((a, v, k) => a + v * w[k], 0) };
}

/** the cut points for one feature: the distinct values at the fitted rows' quantiles 1/bins … (bins−1)/bins */
export function cuts(values, bins) {
  const s = Float64Array.from(values).sort(), out = [];
  for (let q = 1; q < bins; q++) { const v = s[Math.floor((q * s.length) / bins)]; if (!out.length || v > out[out.length - 1]) out.push(v); }
  return out;
}

/** gradient-boosted trees of depth 2 on rows (log-loss): each tree splits at a cut x ≤ c, then each side splits again */
export function boosted(ds, rows, { rounds = 200, rate = 0.1, bins = 32, lambda = 1, minHess = 1 } = {}) {
  const F = ds.features, n = rows.length, y = rows.map((i) => ds.y[i]);
  const C = F.map((f) => cuts(rows.map((i) => ds.cols[f][i]), bins));
  const bin = F.map((f, k) => Int32Array.from(rows, (i) => { const v = ds.cols[f][i]; let b = 0; for (const c of C[k]) { if (!(v > c)) break; b++; } return b; }));   // bin b: C[b−1] < v ≤ C[b]
  const pos = y.reduce((a, v) => a + v, 0), base = Math.log((pos + 0.5) / (n - pos + 0.5));
  const F0 = new Float64Array(n).fill(base), trees = [];
  const leaf = (G, H) => -G / (H + lambda);
  // the best split of the rows in idx: a feature and a cut, the one that most lowers the loss (first wins a tie)
  const best = (idx, g, h) => {
    let top = null;
    const G = idx.reduce((a, r) => a + g[r], 0), H = idx.reduce((a, r) => a + h[r], 0), parent = (G * G) / (H + lambda);
    for (let k = 0; k < F.length; k++) {
      const nb = C[k].length + 1, gs = new Float64Array(nb), hs = new Float64Array(nb);
      for (const r of idx) { gs[bin[k][r]] += g[r]; hs[bin[k][r]] += h[r]; }
      let gl = 0, hl = 0;
      C[k].forEach((cut, b) => {   // split after bin b: x ≤ cut to the left
        gl += gs[b]; hl += hs[b];
        const gr = G - gl, hr = H - hl;
        if (hl < minHess || hr < minHess) return;
        const gain = (gl * gl) / (hl + lambda) + (gr * gr) / (hr + lambda) - parent;
        if (gain > 0 && (!top || gain > top.gain)) top = { k, b, cut, gain };
      });
    }
    return top;
  };
  for (let t = 0; t < rounds; t++) {
    const p = Array.from(F0, (f) => 1 / (1 + Math.exp(-f))), g = p.map((v, r) => v - y[r]), h = p.map((v) => v * (1 - v));
    const all = Array.from({ length: n }, (_, r) => r), root = best(all, g, h);
    if (!root) break;
    const sides = [all.filter((r) => bin[root.k][r] <= root.b), all.filter((r) => bin[root.k][r] > root.b)];
    const tree = { f: F[root.k], cut: root.cut, kids: sides.map((idx) => {
      const s = best(idx, g, h);
      const sum = (part) => [part.reduce((a, r) => a + g[r], 0), part.reduce((a, r) => a + h[r], 0)];
      if (!s) { const [G, H] = sum(idx); return { value: rate * leaf(G, H) }; }
      const parts = [idx.filter((r) => bin[s.k][r] <= s.b), idx.filter((r) => bin[s.k][r] > s.b)];
      return { f: F[s.k], cut: s.cut, values: parts.map((part) => { const [G, H] = sum(part); return rate * leaf(G, H); }) };
    }) };
    trees.push(tree);
    rows.forEach((i, r) => { F0[r] += out(tree, (f) => ds.cols[f][i]); });
  }
  return { kind: 'boosted', rounds: trees.length, rate, bins, lambda, base, trees, score: (i) => trees.reduce((a, tr) => a + out(tr, (f) => ds.cols[f][i]), base) };
}

/** one tree's output for a row whose measurement f is at(f) */
export function out(tree, at) {
  const kid = tree.kids[at(tree.f) <= tree.cut ? 0 : 1];
  return 'value' in kid ? kid.value : kid.values[at(kid.f) <= kid.cut ? 0 : 1];
}

/** how many numbers a fitted model carries — what you would have to ship and audit */
export function size(model) {
  if (model.kind === 'single') return 1;
  if (model.kind === 'logistic') return model.weights.length + model.mean.length + model.sd.length;
  return 1 + model.trees.reduce((a, t) => a + 2 + t.kids.reduce((b, k) => b + ('value' in k ? 1 : 4), 0), 0);   // a split is a feature and a cut
}
