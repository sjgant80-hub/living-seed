// align.mjs — ALIGNMENT, by what the organism is: it cannot act on what it has not proven, every act is chained to the
// proof that licensed it, and it audits itself against what actually happens — standing an organ down when the world
// stops matching what that organ claims, and letting it back only once it has proven itself again.
//
// Build-order step 10. Nothing here is a rule the organism is told to follow; each is a door that does not open without
// its proof:
//
//   licence — every act names its licence. An answer: the live organ and organ 2's receipt for it. A claim: the organ's
//             own measured accuracy on cases it never grew on — never more. A stand-down: the audit that failed. A
//             return: the regrown organ and the gate it cleared. An act whose licence does not hold is refused, and
//             never written.
//   chain   — acts are written to a hash-chained ledger. Anyone holding the genome, the device's data and the cases can
//             replay the whole life and must get the same ledger, byte for byte. A changed byte, a dropped act or a
//             swapped pair breaks the chain.
//   audit   — as the truth of each answered case arrives, the organism compares what each live organ actually got right,
//             over its last window of answers, with what it claimed. Short by more than chance allows (a one-sided
//             Hoeffding bound at confidence 1 − δ) and the organ stands down: it abstains and stops claiming. It regrows
//             the organ from the same recipe on its newest labelled cases; it returns only if it clears the gate on
//             the newest of them.
//
// Powered by the Konomi architecture, created by Thomas Frumkin. Deterministic and total.
import { germinate, stable } from './germinate.mjs';
import { embody, ask, checkReceipt } from './body.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { round6 } from '../vendor/seed-library/seedlib.mjs';

export const ACTS = Object.freeze(['answer', 'abstain', 'claim', 'stand-down', 'return']);
/** The audit: the last WINDOW answers per organ, checked every EVERY answers, at confidence 1 − DELTA; a regrowth needs
 *  REGROW labelled cases since the stand-down, the newest third of them held out for its gate. */
export const AUDIT = Object.freeze({ window: 200, every: 50, delta: 0.0005, regrow: 300 });

/** How far below its claim an organ's accuracy over n answers may fall by chance, at confidence 1 − δ (Hoeffding). */
export const slack = (n, delta) => (n > 0 && delta > 0 && delta < 1 ? round6(Math.sqrt(Math.log(1 / delta) / (2 * n))) : 1);

/* ─── the chain ─────────────────────────────────────────────────────────────────────────────────────────────── */

const ZERO = '0'.repeat(16);
/** A hash-chained ledger of acts. add(act) → the entry written; entries; head (the last hash). */
export function chain() {
  const entries = [];
  return {
    add(act) {
      const prev = entries.length ? entries[entries.length - 1].hash : ZERO, body = { n: entries.length + 1, prev, act };
      const e = Object.freeze({ ...body, hash: sha256Hex(stable(body)).slice(0, 16) });
      entries.push(e);
      return e;
    },
    entries,
    head: () => (entries.length ? entries[entries.length - 1].hash : ZERO),
  };
}

/** Check a ledger link by link. → { ok: true, n } | { ok: false, at, why } */
export function verifyChain(entries) {
  try {
    let prev = ZERO;
    for (let i = 0; i < entries.length; i++) {
      const { hash, ...body } = entries[i];
      if (body.n !== i + 1) return { ok: false, at: i + 1, why: 'an act is missing or out of place' };
      if (body.prev !== prev) return { ok: false, at: i + 1, why: 'the link to the act before is broken' };
      if (sha256Hex(stable(body)).slice(0, 16) !== hash) return { ok: false, at: i + 1, why: 'the act was changed after it was written' };
      prev = hash;
    }
    return { ok: true, n: entries.length };
  } catch { return { ok: false, at: 0, why: 'not a ledger' }; }
}

/* ─── licences ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Does this act's licence hold, given the organism's state? state: { live: { domain → { organism, claim } }, down: Set }.
 * → { ok: true } | { ok: false, why }
 */
export function licensed(act, state) {
  try {
    if (!ACTS.includes(act.kind)) return { ok: false, why: 'not an act the organism has' };
    const d = act.domain, live = state.live[d];
    if (act.kind === 'answer') {
      if (state.down.has(d)) return { ok: false, why: 'its ' + d + ' organ is stood down' };
      if (!live) return { ok: false, why: 'it has no live ' + d + ' organ' };
      if (!checkReceipt(act.receipt)) return { ok: false, why: 'the answer carries no receipt that checks' };
      if (act.receipt.organism !== live.organism || act.receipt.domain !== d) return { ok: false, why: 'the receipt is not from the organ that is live' };
      return { ok: true };
    }
    if (act.kind === 'claim') {
      if (state.down.has(d) || !live) return { ok: false, why: 'it may not claim a ' + d + ' organ it does not have live' };
      if (!(act.accuracy <= live.claim)) return { ok: false, why: 'the claim is more than the organ measured (' + live.claim + ')' };
      return { ok: true };
    }
    if (act.kind === 'stand-down') {
      if (!live || state.down.has(d)) return { ok: false, why: 'there is no live ' + d + ' organ to stand down' };
      if (!(act.audit && act.audit.right / act.audit.n < live.claim - slack(act.audit.n, act.audit.delta))) return { ok: false, why: 'the audit does not show it falling short' };
      return { ok: true };
    }
    if (act.kind === 'return') {
      if (!state.down.has(d)) return { ok: false, why: 'the ' + d + ' organ is not stood down' };
      if (!(act.heldAuc >= act.gate)) return { ok: false, why: 'the regrown organ did not clear the gate' };
      return { ok: true };
    }
    return { ok: true };   // an abstention needs no licence: not answering is always allowed
  } catch { return { ok: false, why: 'the act could not be read' }; }
}

/* ─── the audit ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** What one organ actually got right, over its last window of answers. */
export function tracker(window) {
  const xs = [];
  return {
    push(right) { xs.push(right ? 1 : 0); if (xs.length > window) xs.shift(); },
    n: () => xs.length,
    right: () => xs.reduce((a, b) => a + b, 0),
    clear() { xs.length = 0; },
  };
}

/** An organ's claim: the accuracy of its own VERIFIED answers on the cases it was held out on — what it measured. */
export function measuredClaim(body, dataset, domain) {
  let n = 0, right = 0;
  for (const i of dataset.heldRows) {
    const x = Object.fromEntries(dataset.features.map((f) => [f, dataset.cols[f][i]]));
    const a = ask(body, x, { domain });
    if (a.verdict !== 'VERIFIED') continue;
    n++;
    if (a.label === dataset.y[i]) right++;
  }
  return n ? round6(right / n) : 0;
}

/* ─── a life ────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Live through a stream of cases, each answered and then told its truth. genomeText + substrate: the organism, as
 * germinated; stream: [{ domain, row, truth? }] — the case is the substrate's row; truth defaults to the row's label;
 * opts: { audit: false to never audit (organ 1's organism), regrow: false to stand down without regrowing, ...AUDIT }.
 * → { ledger, acts: { kind → count }, answered, right, wrong, events: [{ at, kind, domain, … }], final }
 */
export async function life(genomeText, substrate, stream, opts = {}) {
  const A = { ...AUDIT, ...opts }, audit = opts.audit !== false, regrowOn = opts.regrow !== false;
  const g = await germinate(genomeText, substrate);
  if (!g.ok) return { ok: false, why: g.why };
  const ledger = chain(), state = { live: {}, down: new Set() }, bodies = {}, tracks = {}, since = {}, events = [];
  let answered = 0, right = 0, wrong = 0, sinceCheck = {};
  const write = (act) => { const l = licensed(act, state); if (!l.ok) return l; ledger.add(act); return { ok: true }; };
  const body0 = embody(g.organism, substrate).body;
  for (const d of Object.keys(body0.patterns)) {
    bodies[d] = body0;
    state.live[d] = { organism: g.organism.id, claim: measuredClaim(body0, substrate.data[d], d) };
    tracks[d] = tracker(A.window); sinceCheck[d] = 0;
    write({ kind: 'claim', domain: d, accuracy: state.live[d].claim, organism: g.organism.id });
  }
  for (let k = 0; k < stream.length; k++) {
    const c = stream[k], ds = substrate.data[c.domain], truth = c.truth === undefined ? ds.y[c.row] : c.truth;
    const x = Object.fromEntries(ds.features.map((f) => [f, ds.cols[f][c.row]]));
    const d = c.domain, b = bodies[d];
    const a = b && !state.down.has(d) ? ask(b, x, { domain: d }) : { verdict: 'ABSTAIN', why: state.down.has(d) ? 'its ' + d + ' organ is stood down' : 'it has no live ' + d + ' organ' };
    if (a.verdict === 'VERIFIED') {
      write({ kind: 'answer', domain: d, at: k, label: a.label, receipt: a.receipt });
      answered++;
      const ok = a.label === truth;
      if (ok) right++; else wrong++;
      tracks[d].push(ok); sinceCheck[d]++;
      if (audit && sinceCheck[d] >= A.every && tracks[d].n() >= A.window) {
        sinceCheck[d] = 0;
        const n = tracks[d].n(), r = tracks[d].right();   // the licence decides: a stand-down is written only if the audit shows it short
        if (write({ kind: 'stand-down', domain: d, at: k, audit: { n, right: r, delta: A.delta }, claim: state.live[d].claim }).ok) {
          state.down.add(d); since[d] = []; events.push({ at: k, kind: 'stand-down', domain: d, accuracy: round6(r / n), claim: state.live[d].claim });
        }
      }
    } else write({ kind: 'abstain', domain: d, at: k });
    // the truth arrives: a stood-down organ keeps its newest labelled cases, to regrow from
    if (state.down.has(d) && regrowOn) {
      since[d].push({ row: c.row, truth });
      if (since[d].length >= A.regrow) {   // regrow from what it was told, not from what the data first said
        const got = since[d], cut = Math.floor((got.length * 2) / 3), y = Uint8Array.from(ds.y);
        for (const s of got) y[s.row] = s.truth;
        const view = { ...ds, y, trainRows: got.slice(0, cut).map((s) => s.row), heldRows: got.slice(cut).map((s) => s.row) };
        const sub = { ...substrate, data: { ...substrate.data, [d]: view } };
        const gr = await germinate(genomeText, sub);
        const organ = gr.organism.organs.find((o) => o.domain === d);   // the same recipe: it always grows, live or cut
        if (write({ kind: 'return', domain: d, at: k, heldAuc: organ.heldAuc, gate: gr.organism.gate.auc, organism: gr.organism.id }).ok) {   // only if it cleared the gate
          const nb = embody(gr.organism, sub).body, claim = measuredClaim(nb, view, d);
          state.down.delete(d); bodies[d] = nb; state.live[d] = { organism: gr.organism.id, claim }; tracks[d].clear(); sinceCheck[d] = 0;
          write({ kind: 'claim', domain: d, accuracy: claim, organism: gr.organism.id });
          events.push({ at: k, kind: 'return', domain: d, heldAuc: organ.heldAuc, claim });
        }
        since[d] = [];   // either way, a fresh batch: a regrowth that failed waits for the next REGROW cases
      }
    }
  }
  const acts = Object.fromEntries(ACTS.map((kind) => [kind, ledger.entries.filter((e) => e.act.kind === kind).length]));
  return { ok: true, ledger: ledger.entries, head: ledger.head(), acts, answered, right, wrong, events, final: { live: Object.fromEntries(Object.entries(state.live).map(([d, v]) => [d, v.claim])), down: [...state.down].sort() } };
}
