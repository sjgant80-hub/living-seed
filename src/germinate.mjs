// germinate.mjs — Γ, GERMINATION: a sealed genome + the device's own data → a living organism, grown here, offline.
//
// The second half of build-order step 1. A genome carries recipes; the device carries data; the ribosome (seed-library's,
// vendored unchanged) grows each organ from its recipe ON THIS DEVICE'S DATA and grades it on cases it never grew on.
// What grows is decided by the gate, not by the maker:
//   live    — the organ cleared the genome's gate (held-out AUC ≥ gate.auc) on this device: it answers
//   cut     — it grew but did not clear the gate here, or could not grow: it never answers
//   dormant — this device holds no data for its domain: it waits, and never answers
// The organism is a plain record — what it is, who made it, where it grew, and each organ's state, score and body (the
// rules it fits to this device's data). Its id is the SHA-256 of that record, so the same genome on the same data grows
// the same organism, byte for byte, on any device. answer() asks it about one case: a VERIFIED call from a live organ,
// or ABSTAIN — never a guess from an organ that did not earn its place.
//
// The genome is opened first (genome.mjs: verify before parse). A refused genome grows nothing. Pure and total apart
// from that signature check; junk gets a refusal, never a throw.
import { germinate as express, decodeSeed, scoreRow, grownBody, round6, utf8Bytes } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { open } from './genome.mjs';

export const KIND = 'living-seed.organism';

/** The organism's one byte form: JSON with sorted keys, no whitespace, finite numbers in JavaScript's shortest round-trip
 *  form (the same digits on every engine). Anything else — NaN, Infinity, a function, a class instance — throws. */
export function stable(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new TypeError('not a finite number'); return JSON.stringify(v); }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  throw new TypeError('not plain data');
}
const no = (why) => ({ ok: false, why });

/**
 * The operating point an organ answers at, from its TRAIN rows only: a case is called yes when it scores above the
 * score that puts the train rows' own share of yes cases on top — exactly the cut seed-library's heldAccuracy grades.
 */
export function operatingPoint(card, dataset, trainRows) {
  const base = trainRows.reduce((a, i) => a + dataset.y[i], 0) / trainRows.length;
  const ts = trainRows.map((i) => scoreRow(card, dataset, i)).sort((a, b) => a - b);
  return ts[Math.min(ts.length - 1, Math.floor((1 - base) * ts.length))];
}

/** One organ from its recipe on one dataset (or none). → { domain, recipe, state, why, …scores, body } */
function grow(recipe, dataset, gateAuc, grower = express) {
  const domain = decodeSeed(recipe).seed.domain;
  if (!dataset) return { domain, recipe, state: 'dormant', why: 'this device holds no ' + domain + ' data' };
  const g = grower(dataset, recipe);
  if (!g.ok) return { domain, recipe, state: 'cut', why: 'it could not grow here: ' + g.error };
  const scores = { train: g.train, held: g.held, heldAuc: g.heldAuc, heldAcc: g.heldAcc, base: g.base };
  if (!(g.heldAuc >= gateAuc)) return { domain, recipe, state: 'cut', why: 'AUC ' + g.heldAuc + ' on cases it never grew on is under the gate (' + gateAuc + ')', ...scores };
  return { domain, recipe, state: 'live', why: 'AUC ' + g.heldAuc + ' on ' + g.held + ' cases it never grew on clears the gate (' + gateAuc + ')', ...scores,
    body: { ...grownBody(g.scorecard), threshold: round6(operatingPoint(g.scorecard, dataset, dataset.trainRows)) } };
}

/**
 * Γ. genomeText — a sealed genome; substrate — { name, data: { domain: dataset } } (seed-library's dataset shape: the
 * device's own rows, its train and held-out split); opts.trust — maker keys this device accepts; opts.pool — a recycling
 * pool (recycle.mjs) that hands back an organ already grown from the same recipe on equal data.
 * → { ok, organism } | a refusal. Never reads the network.
 */
export async function germinate(genomeText, substrate, opts = {}) {
  try {
    const g = await open(genomeText, opts);
    if (!g.ok) return no('the genome was refused: ' + g.why);
    if (!substrate || typeof substrate !== 'object' || typeof substrate.name !== 'string' || !substrate.name) return no('no substrate to grow on');
    const data = substrate.data && typeof substrate.data === 'object' ? substrate.data : {};
    const has = (d) => Object.prototype.hasOwnProperty.call(data, d) && data[d] && data[d].ok !== false;
    const organs = g.fields.organs.map((recipe) => { const d = decodeSeed(recipe).seed.domain; return grow(recipe, has(d) ? data[d] : null, g.fields.gate.auc, opts && opts.pool ? opts.pool.germinate : express); });
    const record = { kind: KIND, v: 1, genome: g.id, name: g.fields.name, parents: g.fields.parents, by: g.fields.by, gate: g.fields.gate, substrate: substrate.name, organs };
    return { ok: true, organism: { ...record, id: sha256Hex(stable(record)).slice(0, 16) } };
  } catch { return no('it could not germinate'); }
}

/**
 * Ask the organism about one case of a domain: x — the case's features by name. → { verdict: 'VERIFIED', label (0|1),
 * score, threshold, organ: domain, fired: [rule…] } from a live organ, or { verdict: 'ABSTAIN', why }.
 */
export function answer(organism, domain, x) {
  try {
    const organ = organism.organs.find((o) => o.domain === domain);
    if (!organ) return { verdict: 'ABSTAIN', why: 'it has no organ for ' + domain };
    if (organ.state !== 'live') return { verdict: 'ABSTAIN', why: 'its ' + domain + ' organ is ' + organ.state + ': ' + organ.why };
    const rules = organ.body.rules;
    if (!rules.every((r) => typeof x[r.feat] === 'number' && Number.isFinite(x[r.feat]))) return { verdict: 'ABSTAIN', why: 'the case lacks a measurement its rules read' };
    const fired = rules.filter((r) => (r.op === '>' ? x[r.feat] > r.v : x[r.feat] <= r.v));
    const score = round6(fired.reduce((s, r) => s + r.w, 0));
    return { verdict: 'VERIFIED', label: score > organ.body.threshold ? 1 : 0, score, threshold: organ.body.threshold, organ: domain, fired };
  } catch { return { verdict: 'ABSTAIN', why: 'the case could not be read' }; }
}

/** One row of a dataset as the case answer() reads: { feature: value }. */
export function caseOf(dataset, i) {
  return Object.fromEntries(dataset.features.map((f) => [f, dataset.cols[f][i]]));
}

/** Sizes: the genome that travels against the organism it grows into (its live organs' bodies). */
export function sizes(genomeText, organism) {
  const genomeBytes = utf8Bytes(genomeText);
  const grownBytes = utf8Bytes(JSON.stringify(organism.organs.filter((o) => o.state === 'live').map((o) => o.body)));
  return { genomeBytes, grownBytes, ratio: genomeBytes ? round6(grownBytes / genomeBytes) : 0 };
}
