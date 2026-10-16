// body.mjs — THE BODY: what a germinated organism knows, and the only ways it may answer.
//
// Build-order step 2. Germination (organ 1) leaves organs: rules fitted to this device's data, each gated on cases it
// never grew on. The body gives the organism four kinds of knowing, each with its own way of refusing:
//
//   patterns  — the live organs, each with the SHAPE of the data it grew on (per-feature quantiles of its train cases).
//               A case is answered only by an organ it resembles: routed by geometric membership (1 inside a
//               feature's middle half, decaying outside it), ABSTAIN when no organ covers it — no answer far from what
//               an organ has seen. Every answer carries a receipt naming the genome, the organism, the organ, its
//               held-out score and the exact rules that fired; the receipt re-hashes to catch any edit.
//   cube      — exact facts: key → every value any source asserted, append-only, each with its source and time. Read
//               back byte for byte, never blended, never normalised ('count' and 'Count' are two keys). A missing
//               fact is an ABSTAIN, not a guess.
//   memory    — an auditable episodic log: what, when, why, each entry naming the one before it (a hash chain — its
//               continuity can be checked, and an edit anywhere breaks it). Recall FUSES a lexical ranking (BM25)
//               with a geometric one (cosine over hashed n-grams): the estate measured that geometry alone loses to
//               lexical recall on words it knows, and wins only where the words differ — so route and fuse, never
//               replace. Nothing that shares no evidence with the query is returned.
//   the slot  — a small model may PROPOSE (which organ a free-text question is about, which measurements matter). A
//               proposal is marked ungraded and can never be an answer: to answer, the body still needs the case's
//               measurements, routed and gated as above.
//
// The routing fingerprint and membership are the Konomi SLM's (sjgant80-hub/konomi-slm), re-implemented here over
// the organism's own organs. Powered by the Konomi architecture, created by Thomas Frumkin. Pure and total: junk gets a
// refusal or an ABSTAIN, never a throw; no clock, no randomness, no network.
import { quantile, round6 } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { stable, answer as organAnswer } from './germinate.mjs';

export const ROUTE_MIN = 0.35;   // below this resemblance to every organ's data, the case is out of distribution
export const DIMS = 256;         // the memory's geometric space
const no = (why) => ({ ok: false, why });
const abstain = (why, extra = {}) => ({ verdict: 'ABSTAIN', why, ...extra });
const hash16 = (v) => sha256Hex(stable(v)).slice(0, 16);
const isText = (s) => typeof s === 'string' && s.length > 0;

// ── PATTERNS ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A feature's shape on the train rows: min, quartiles, median, max. */
export function fingerprint(dataset, rows, feat) {
  const xs = rows.map((i) => dataset.cols[feat][i]);
  const q = (p) => round6(quantile(dataset, feat, rows, p));
  return { min: round6(Math.min(...xs)), q1: q(0.25), med: q(0.5), q3: q(0.75), max: round6(Math.max(...xs)) };
}

/** How well one value sits in a feature's shape: 1 inside the middle half, decaying with distance outside it. */
export function membership(value, fp) {
  if (typeof value !== 'number' || !fp) return 0;
  const span = Math.max(fp.q3 - fp.q1, (fp.max - fp.min) / 2, 1e-9);
  // distance outside the middle half (0 inside it); NaN and ±Infinity come out as 0 through round6 and exp
  return round6(Math.exp(-Math.max(fp.q1 - value, value - fp.q3, 0) / span));
}

/**
 * The body of a germinated organism, on the substrate it grew on. Each live organ keeps its rules and the shape of
 * its train data; cut and dormant organs are listed, and never answer. → { ok, body } | a refusal
 */
export function embody(organism, substrate) {
  try {
    if (!organism || !Array.isArray(organism.organs) || !isText(organism.id)) return no('not an organism');
    if (!substrate || substrate.name !== organism.substrate) return no('the body forms on the substrate the organism grew on');
    const data = substrate.data || {};
    const patterns = {}, resting = [];
    for (const o of organism.organs) {
      const ds = Object.prototype.hasOwnProperty.call(data, o.domain) ? data[o.domain] : null;
      if (o.state !== 'live' || !ds) { resting.push({ domain: o.domain, state: o.state, why: o.why }); continue; }
      patterns[o.domain] = {
        domain: o.domain, rules: o.body.rules, threshold: o.body.threshold, heldAuc: o.heldAuc, held: o.held,
        features: ds.features.slice(), shape: Object.fromEntries(ds.features.map((f) => [f, fingerprint(ds, ds.trainRows, f)])),
      };
    }
    return { ok: true, body: { organism: organism.id, genome: organism.genome, gate: organism.gate.auc, patterns, resting } };
  } catch { return no('the body could not form'); }
}

/** How well a case resembles each organ's data — every feature of the organ must be measured. → [{ domain, fit }]
 *  best first; ties keep the genome's order (the sort is stable). */
export function route(body, x) {
  return Object.values(body.patterns).map((p) => ({
    domain: p.domain,
    fit: p.features.every((f) => Number.isFinite(x[f])) ? round6(p.features.reduce((a, f) => a + membership(x[f], p.shape[f]), 0) / p.features.length) : 0,
  })).sort((a, b) => b.fit - a.fit);
}

/**
 * Ask the body about one case. opts.domain names the organ to ask; without it the case is routed to the organ it
 * resembles most. → { verdict: 'VERIFIED', label, score, threshold, domain, fit, fired, receipt } | { verdict: 'ABSTAIN', why }
 */
export function ask(body, x, opts = {}) {
  try {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return abstain('the case could not be read');
    const ranked = route(body, x);
    const want = opts && opts.domain;
    if (want && !body.patterns[want]) {
      const r = body.resting.find((o) => o.domain === want);
      return abstain(r ? 'its ' + want + ' organ is ' + r.state + ': ' + r.why : 'it has no organ for ' + want);
    }
    const pick = want ? ranked.find((r) => r.domain === want) : ranked[0];
    if (!pick || pick.fit < ROUTE_MIN) return abstain('out of distribution: the case is unlike the data ' + (want ? 'its ' + want + ' organ' : 'any organ') + ' grew on', { fit: pick ? pick.fit : 0 });
    const p = body.patterns[pick.domain];
    const a = organAnswer({ organs: [{ domain: p.domain, state: 'live', body: { rules: p.rules, threshold: p.threshold } }] }, p.domain, x);
    if (a.verdict !== 'VERIFIED') return abstain(a.why, { fit: pick.fit });
    const core = { kind: 'living-seed.answer', v: 1, genome: body.genome, organism: body.organism, domain: p.domain, heldAuc: p.heldAuc, held: p.held, gate: body.gate,
      fit: pick.fit, score: a.score, threshold: a.threshold, label: a.label, fired: a.fired.map((r) => r.feat + ' ' + r.op + ' ' + r.v + ' ' + r.w) };
    return { verdict: 'VERIFIED', label: a.label, score: a.score, threshold: a.threshold, domain: p.domain, fit: pick.fit, fired: a.fired, receipt: { ...core, hash: sha256Hex(stable(core)) } };
  } catch { return abstain('the case could not be read'); }
}

/** Does this receipt re-hash to itself? Any edited field breaks it. */
export function checkReceipt(receipt) {
  try {
    const { hash, ...core } = receipt;
    return typeof hash === 'string' && core.kind === 'living-seed.answer' && sha256Hex(stable(core)) === hash;
  } catch { return false; }
}

// ── CUBE: exact facts ───────────────────────────────────────────────────────────────────────────────────────────

/** An empty cube. Facts live in write order; `root` chains them, so the whole store can be checked. */
export const cube = () => ({ facts: [], root: '0'.repeat(16) });

/** Write one fact. key, source: non-empty text; ts: a finite number; value: plain data. → { ok, cube, id } (a new cube) */
export function cubeWrite(c, fact) {
  try {
    const { key, value, source, ts } = fact || {};
    if (!isText(key) || !isText(source)) return no('a fact needs a key and a source');
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return no('a fact needs a time');
    const f = { key, value, source, ts };
    const id = hash16(f);   // stable() refuses anything that is not plain data
    return { ok: true, id, cube: { facts: [...c.facts, { ...f, id }], root: hash16([c.root, id]) } };
  } catch { return no('the value is not plain data'); }
}

/** Read a fact back exactly: the latest by time (a later write wins an exact tie), or exactly one source's. */
export function cubeRead(c, key, opts = {}) {
  const src = opts && opts.source;
  let best = null;
  for (const f of c.facts) if (f.key === key && (src === undefined || f.source === src) && (!best || f.ts >= best.ts)) best = f;
  return best ? { verdict: 'EXACT', value: best.value, source: best.source, ts: best.ts, id: best.id } : abstain(src === undefined ? 'no fact under ' + JSON.stringify(key) : 'no fact from ' + JSON.stringify(src) + ' under ' + JSON.stringify(key));
}

/** Every fact ever written under a key, in write order. */
export const cubeHistory = (c, key) => c.facts.filter((f) => f.key === key);

/** Re-derive every id and the chain. → { ok, at } — at: the first fact that does not hash to itself, or -1 */
export function cubeCheck(c) {
  try {
    let root = '0'.repeat(16);
    for (let i = 0; i < c.facts.length; i++) {
      const { id, ...f } = c.facts[i];
      if (hash16(f) !== id) return { ok: false, at: i };
      root = hash16([root, id]);
    }
    return root === c.root ? { ok: true, at: -1 } : { ok: false, at: c.facts.length };
  } catch { return { ok: false, at: 0 }; }
}

// ── MEMORY: episodic, auditable, fused recall ───────────────────────────────────────────────────────────────────

/** Words of a text: lower-case runs of letters and digits. */
export const words = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

/** A text's place in the geometric space: signed hashing of its words and character trigrams, unit length. */
export function vectorOf(text) {
  const v = new Array(DIMS).fill(0);
  const add = (tok, w) => { const h = sha256Hex(tok); const i = parseInt(h.slice(0, 4), 16) % DIMS; v[i] += (parseInt(h[4], 16) & 1 ? 1 : -1) * w; };
  for (const w of words(text)) { add('w:' + w, 1); const p = '#' + w + '#'; [...Array(w.length).keys()].forEach((i) => add('t:' + p.slice(i, i + 3), 0.5)); }   // a word of n letters has n trigrams once wrapped in #…#
  const n = Math.hypot(...v);
  return n ? v.map((x) => round6(x / n)) : v;
}
const cosine = (a, b) => round6(a.reduce((s, x, i) => s + x * b[i], 0));

/** An empty memory. */
export const memory = () => ({ entries: [] });

/** Remember one episode: { text, what, when, why }. Each entry names the one before it. → { ok, memory, id } */
export function remember(m, ep) {
  try {
    const { text, what, when, why } = ep || {};
    if (!isText(text) || !isText(what) || !isText(why)) return no('a memory needs its text, what it is, and why it was kept');
    if (typeof when !== 'number' || !Number.isFinite(when)) return no('a memory needs a time');
    const n = m.entries.length, prev = n ? m.entries[n - 1].id : null;
    const core = { n, prev, text, what, when, why };
    const id = hash16(core);
    return { ok: true, id, memory: { entries: [...m.entries, { ...core, id }] } };
  } catch { return no('the memory could not be written'); }
}

/** Is the chain whole? → { ok, at } — at: the first entry that does not follow from the one before it, or -1 */
export function memoryCheck(m) {
  try {
    let prev = null;
    for (let i = 0; i < m.entries.length; i++) {
      const { id, ...core } = m.entries[i];
      if (core.n !== i || core.prev !== prev || hash16(core) !== id) return { ok: false, at: i };
      prev = id;
    }
    return { ok: true, at: -1 };
  } catch { return { ok: false, at: 0 }; }
}

/** Rank positions, 1 = highest; equal values keep their order. */
export function ranks(xs) {
  const r = [];
  xs.map((x, i) => i).sort((a, b) => xs[b] - xs[a]).forEach((i, at) => { r[i] = at + 1; });
  return r;
}

/**
 * Reciprocal-rank fusion of a lexical and a geometric score per item: 1/(60 + lexical rank) — only for items that
 * share a word with the query — plus 1/(60 + geometric rank). An item with no shared word and a cosine at or under
 * `floor` is dropped. → [{ i, fused }] best first, at most k
 */
export function fuse(lexical, geometric, { k = 3, floor = 0.2 } = {}) {
  const rl = ranks(lexical), rg = ranks(geometric);
  return lexical.map((s, i) => ({ i, fused: round6((s > 0 ? 1 / (60 + rl[i]) : 0) + 1 / (60 + rg[i])) }))
    .filter(({ i }) => lexical[i] > 0 || geometric[i] > floor)
    .sort((a, b) => b.fused - a.fused).slice(0, Math.max(0, k));
}

/**
 * Recall: the k episodes most like the query — BM25 over words fused with cosine over the geometric space (fuse()).
 * → [{ id, text, what, when, why, bm25, cosine, fused, rank }]
 */
export function recall(m, query, { k = 3, floor = 0.2 } = {}) {
  try {
    const es = m.entries, q = [...new Set(words(query))];
    const docs = es.map((e) => words(e.text + ' ' + e.what)), avg = docs.reduce((a, d) => a + d.length, 0) / docs.length;
    const df = Object.fromEntries(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
    const bm25 = docs.map((d) => round6(q.reduce((s, t) => {
      const tf = d.filter((w) => w === t).length;
      return tf ? s + Math.log(1 + (docs.length - df[t] + 0.5) / (df[t] + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * d.length / avg)) : s;
    }, 0)));
    const qv = vectorOf(query), cos = es.map((e) => cosine(qv, vectorOf(e.text + ' ' + e.what)));
    return fuse(bm25, cos, { k, floor }).map(({ i, fused }, at) => ({ id: es[i].id, text: es[i].text, what: es[i].what, when: es[i].when, why: es[i].why, bm25: bm25[i], cosine: cos[i], fused, rank: at + 1 }));
  } catch { return []; }
}

// ── THE SLOT: a small model proposes, never answers ─────────────────────────────────────────────────────────────

/**
 * Let a proposer (a small model, or anything) read free text and say which organ it is about. The result is marked
 * ungraded; it names an organ only if the body has one live. → { graded: false, proposal: domain|null, why }
 */
export function imagine(body, text, proposer) {
  try {
    const p = typeof proposer === 'function' ? proposer(String(text)) : null;
    const d = p && typeof p.domain === 'string' ? p.domain : null;
    if (!d) return { graded: false, proposal: null, why: 'the proposer named no organ' };
    if (!body.patterns[d]) return { graded: false, proposal: null, why: 'the proposer named ' + JSON.stringify(d) + ', which this body has no live organ for' };
    return { graded: false, proposal: d, why: 'a proposal only: to answer, give the case its measurements and ask the ' + d + ' organ' };
  } catch { return { graded: false, proposal: null, why: 'the proposer failed' }; }
}
