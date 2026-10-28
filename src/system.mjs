// system.mjs — organ 13: THE SEED GROWS THE WHOLE SYSTEM. One genome, one device's data and its owner's phrase grow the
// organism (germinate.mjs: each organ grown here and cut unless it clears the gate on cases it never grew on) AND the system
// it lives in — every live organ a node of the estate's shared foundation (vendor/fall-kit-core, copied verbatim and
// pinned), a keeper node that asks them, the owner's keys worked out from the phrase (the foundation's seed.mjs), and a
// roster the owner's founder signs, from which every node pins every other. Nothing else is needed and nothing is fetched.
//
//   planOf(organism)               which organs become nodes: the live ones, by domain; a cut or dormant organ grows none
//   answerOf(organism, domain, x)  an organ's answer to one case, with a receipt: the organism, the organ, a digest of the
//                                  case, the label, score and threshold, and how many rules fired
//   checksFor(organism, cases)     what the keeper checks, holding the same organism and the cases it asked: the receipt
//                                  holds, and the organ, run again on the case, gives the same receipt
//   grow(genome, substrate, phrase, opts)   the whole system, grown
//   roundTrip(system, domain, x, via)       one ask through it as it would cross a wire: the keeper's signed ask, the
//                                  organ node's signed answer, the keeper's check
//   fingerprint(system, cases)     the organism, the signed roster and the receipts of these asks, as one digest: the
//                                  same on every machine that grows the same genome on the same data with the same phrase
//
// The planning and the receipts are pure and total; grow, roundTrip and fingerprint are glue over germinate, the seed and
// the node.
// Powered by the Konomi architecture, created by Thomas Frumkin.
import { germinate, answer } from './germinate.mjs';
import { createNode, digestOf, receiptHolds } from '../vendor/fall-kit-core/node.mjs';
import { plant, rosterOf } from '../vendor/fall-kit-core/seed.mjs';
import { readRoster, rosterChanges } from '../vendor/fall-kit-core/roster.mjs';
import { hex } from '../vendor/fall-kit-core/identity.mjs';
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';

export const KEEPER = 'keeper';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const no = (why) => ({ ok: false, why });
const hashOf = (core) => hex(sha256(new TextEncoder().encode(JSON.stringify(core))));
// a case that refers to itself, or holds what JSON cannot write, has no digest: it cannot be asked or checked
const digestOr = (x) => { try { return digestOf(x); } catch { return null; } };

export function planOf(organism) {
  if (!isObj(organism) || !Array.isArray(organism.organs)) return no('not an organism');
  const by = (s) => organism.organs.filter((o) => isObj(o) && o.state === s && typeof o.domain === 'string').map((o) => o.domain);
  return { ok: true, live: by('live'), cut: by('cut'), dormant: by('dormant') };
}

export function answerOf(organism, domain, x) {
  const a = answer(organism, domain, x);
  if (a.verdict !== 'VERIFIED') return { verdict: 'ABSTAIN', why: a.why };
  const c = digestOr(x);
  if (c === null) return { verdict: 'ABSTAIN', why: 'the case could not be read' };
  const core = { organism: organism.id, organ: domain, case: c, label: a.label, score: a.score, threshold: a.threshold, fired: a.fired.length };
  return { verdict: 'VERIFIED', label: a.label, receipt: { ...core, receiptHash: hashOf(core) } };
}

export function checksFor(organism, cases) {
  const byDigest = new Map();
  for (const x of Array.isArray(cases) ? cases : []) { const d = isObj(x) ? digestOr(x) : null; if (d !== null) byDigest.set(d, x); }
  return (ans) => {
    if (!receiptHolds(ans)) return false;
    const r = ans.receipt;
    if (!byDigest.has(r.case)) return false;
    // run again here, the receipt names the keeper's own organism, so a receipt from any other organism cannot match it
    const again = answerOf(organism, r.organ, byDigest.get(r.case));
    return again.verdict === 'VERIFIED' && again.receipt.receiptHash === r.receiptHash && ans.label === again.label;
  };
}

/** opts: { policy (the genesis policy), clock, cases: { domain: [case] } (what the keeper will ask), germinate (germinate's opts) } */
export async function grow(genomeText, substrate, phrase, opts = {}) {
  const o = isObj(opts) ? opts : {};
  const g = await germinate(genomeText, substrate, o.germinate);
  if (!g.ok) return no(g.why);
  const plan = planOf(g.organism);
  const planted = await plant(phrase, [KEEPER, ...plan.live], { policy: o.policy });
  if (!planted.ok) return no(planted.why);
  const base = (role) => ({ name: role, identity: planted.ids[role], genesis: planted.genesis, clock: o.clock });
  const cases = isObj(o.cases) ? o.cases : {};
  const nodes = { [KEEPER]: await createNode({ ...base(KEEPER), checks: Object.fromEntries(plan.live.map((d) => [d, checksFor(g.organism, cases[d])])) }) };
  for (const d of plan.live) nodes[d] = await createNode({ ...base(d), skills: { [d]: async (x) => answerOf(g.organism, d, x) } });
  const ro = await rosterOf(planted, Object.values(nodes).map((n) => n.card()));
  if (!ro.ok) return no(ro.why);
  for (const n of Object.values(nodes)) {
    const read = await readRoster(ro.roster, planted.ids.founder.id);
    for (const c of rosterChanges(read, n.pinned(), n.id).pin) await n.pin(c);
  }
  return { ok: true, organism: g.organism, plan, planted, nodes, roster: ro.roster };
}

/** via — the node that hears the ask (by default the one it is addressed to). → { outcome: 'verified' | 'failed' |
 *  'abstain' (the keeper's), 'unasked' (no node holds the organ), 'unanswered' (no reply), 'refused' (the door), answer } */
export async function roundTrip(system, domain, x, via) {
  const keeper = system.nodes[KEEPER];
  const q = await keeper.ask(domain, x);
  if (!q.ok) return { outcome: 'unasked', why: q.why };
  // the foundation's hear always gives a list of replies, empty when its door refused or it had nothing to say
  const reply = (await (via || Object.values(system.nodes).find((n) => n.id === q.to)).hear(q.bytes)).replies[0];
  if (!reply) return { outcome: 'unanswered' };
  const back = await keeper.hear(reply.bytes);
  return { outcome: back.outcome || 'refused', answer: back.answer };
}

/** cases: { domain: [case] }, asked domain by domain in name order, each in its given order. */
export async function fingerprint(system, cases) {
  const answers = [];
  for (const d of Object.keys(cases).sort()) for (const x of cases[d]) {
    const t = await roundTrip(system, d, x);
    answers.push({ organ: d, outcome: t.outcome, receipt: isObj(t.answer) && isObj(t.answer.receipt) ? t.answer.receipt.receiptHash : null });
  }
  const core = { organism: system.organism.id, roster: digestOf(system.roster), answers: digestOf(answers) };
  return { ...core, asked: answers.length, verified: answers.filter((a) => a.outcome === 'verified').length, digest: digestOf(core) };
}
