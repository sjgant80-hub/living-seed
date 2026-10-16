// mesh.mjs — THE MESH: organisms on their own devices, coupled into one living web that wires, prunes and grows itself.
//
// Build-order step 8, with Simon's mesh-of-specialists spec (2026-10-16) folded in. Every node is an organism grown from a
// genome on its own device's data. Nothing passes between nodes except signed envelopes through organ 3's gate —
// addressed to one organism, carrying the sender's next counter, refused if replayed, redirected or forged.
//
//   advertise — each node tells the others which organs it has live and how well each scored on cases it never grew
//               on: the capability map. Every node keeps the latest advert per (node, domain), so maps converge.
//   route     — a task a node cannot answer itself (no live organ, or the case is unlike its data) goes to the node
//               whose advert, plus the strength of the link between them, fits best. The answer comes back signed.
//   learn     — when the truth arrives, a link whose answer was right strengthens, a wrong one weakens; every round
//               every link fades a little, and a link that fades below the floor is dropped. The web draws itself
//               from use (what fires together wires together) and prunes what stops paying.
//   grow      — a node that keeps abstaining on a domain it holds data for has a gap: it asks the best advertiser for a
//               lesson, weighs it on its own data (organ 3 — never trusting the score it claims), and if it clears the
//               bar, grows the specialist: a child of its own genome, carrying the new organ, sealed by itself.
//   defend    — bytes a node refuses become an antibody (their fingerprint), shared with its neighbours, so the same
//               attack is refused on sight everywhere.
//   survive   — a node that dies stops answering; links to it fade and drop; tasks route elsewhere. A partition heals:
//               adverts flow again and every map converges.
//   immune    — with opts.immune, organ 9 (immune.mjs) stands in front of every node's gate: bounded memory, the
//               rebound on sources the gate keeps refusing, proofs that a key is in two hands (checked by every node
//               itself, then spread), and a watch on each peer's behaviour. Without it the mesh is organ 8's, exactly.
//
// Powered by the Konomi architecture, created by Thomas Frumkin. Deterministic (seeded, Ed25519 signatures are
// deterministic), so a run is a receipt anyone can re-derive.
import { envelope, admit, weigh, immune, fingerprintOf, GRAMMAR, MAX_MSG } from './gate.mjs';
import * as I from './immune.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';
import { germinate, caseOf } from './germinate.mjs';
import { embody, ask } from './body.mjs';
import { seal, open } from './genome.mjs';
import { rng, round6 } from '../vendor/seed-library/seedlib.mjs';

const NUM = '-?\\d+(\\.\\d+)?';
/** The mesh's grammar: what each kind of message's body looks like, exactly. */
export const MESH = Object.freeze({
  kinds: ['advert', 'task', 'reply', 'lesson', 'antibody'],
  body: {
    advert: /^[a-z][a-z0-9-]{0,31} (0|1|0\.\d{1,6}) [1-9]\d{0,6}$/,
    task: new RegExp('^[0-9a-f]{16} [a-z][a-z0-9-]{0,31} ' + NUM + '(,' + NUM + '){0,15}$'),
    reply: new RegExp('^[0-9a-f]{16} (VERIFIED [01] ' + NUM + '|ABSTAIN)$'),
    lesson: GRAMMAR.body.lesson,
    antibody: GRAMMAR.body.antibody,
  },
});
export const ETA = 0.2, ALPHA = 0.2, DECAY = 0.95, PRUNE = 0.05, GAP = 4, PRIOR = 4;
const num = (v) => String(round6(v));

/** A node: an organism grown on its own data, with its keys, its links, its map of the others and its immune memory. */
export async function node(name, genomeText, substrate, keys) {
  const g = await germinate(genomeText, substrate);
  if (!g.ok) return { ok: false, why: g.why };
  return { ok: true, node: { name, keys, pub: keys.pub, genome: genomeText, substrate, org: g.organism, body: embody(g.organism, substrate).body,
    links: new Map(), evidence: new Map(), inLast: new Map(), outN: new Map(), map: new Map(), abstains: new Map(), imm: immune(), alive: true, grown: [], claims: null } };
}

/** The live organs a node advertises: domain, unseen-case AUC, cases graded. A node with claims set advertises those
 *  scores instead — a node that over-claims, as a broken or dishonest one would; the mesh has to find it out. */
export const adverts = (n) => n.org.organs.filter((o) => o.state === 'live').map((o) => ({ domain: o.domain, auc: n.claims && n.claims[o.domain] !== undefined ? n.claims[o.domain] : o.heldAuc, held: o.held }));

/**
 * A mesh of nodes that trust each other's keys. opts.cut(a, b) → true when a and b cannot reach each other (a partition);
 * opts.learn: 'hebb' (default) | 'ema' | 'evidence'; opts.explore: the chance (0 by default) of routing to another capable node
 * instead of the best, drawn from opts.seed. opts.immune: { cap, law, limits, channels } turns organ 9 on (see immune.mjs); channels: true watches behaviour by channel (9b).
 * → { nodes, send, gossip, task, log, stats }
 */
export function mesh(nodes, opts = {}) {
  const imm = opts.immune || null, G = imm ? { kinds: [...MESH.kinds, 'proof'], body: { ...MESH.body, proof: I.PROOF } } : MESH;
  const byName = new Map(nodes.map((n) => [n.name, n])), byPub = new Map(nodes.map((n) => [n.pub, n])), senders = Object.fromEntries(nodes.map((n) => [n.pub, G.kinds]));
  const log = [], stats = { sent: 0, admitted: 0, refused: 0, onSight: 0, lost: 0 };
  if (imm) {
    Object.assign(stats, { owed: 0, proofs: 0, badProofs: 0, unshared: 0, revoked: 0 });
    for (const n of nodes) n.sentinel = { memory: I.memory(imm.cap), rebound: I.rebound(imm.law), ledger: I.ledger(), watch: imm.channels ? I.channels(imm.limits) : I.behaviour(imm.limits), trusted: { ...senders }, revoked: new Map() };
  }
  const reach = (a, b) => a.alive && b.alive && !(opts.cut && opts.cut(a.name, b.name));
  const explore = opts.explore || 0, er = rng(opts.seed || 1);
  /** a link learns from one outcome. 'hebb' (the default): +ETA when right, −ETA/2 when wrong or unanswered, held in 0…1 —
   *  it saturates, so two mostly-right links look alike. 'ema': the link becomes a running average of being right (rate
   *  ALPHA), so it tracks how reliable the route actually is. 'evidence': a route is scored by its advert counted as
   *  PRIOR cases, plus every case it was actually right or wrong on — once there is evidence, the claim stops deciding. */
  const learn = (a, b, right) => {
    if (opts.learn === 'evidence') {   // what it actually did: cases routed, cases right
      const e = a.evidence.get(b) || { n: 0, r: 0 };
      const f = { n: e.n + 1, r: e.r + (right ? 1 : 0) };
      a.evidence.set(b, f); a.links.set(b, round6(f.r / f.n));
      return;
    }
    const w = a.links.get(b) || 0;
    a.links.set(b, opts.learn === 'ema' ? round6(w + ALPHA * ((right ? 1 : 0) - w)) : right ? Math.min(1, w + ETA) : Math.max(0, w - ETA / 2));
  };

  /** deliver raw bytes to a node: refused on sight if its immune memory knows them; else through the gate. With organ 9
   *  on, source names the link the bytes came in on and nonce is the work they carry, if the source owes any. */
  async function receive(to, text, source, nonce, round) {
    if (!imm) {
      if (to.imm.seen(text)) { stats.onSight++; return { admit: false, stage: 'immune', why: 'refused on sight' }; }
      const a = await admit(text, { me: to.org.id, senders, last: (p) => to.inLast.get(p) || 0, grammar: MESH });
      if (a.admit) { to.inLast.set(a.msg.from, a.msg.n); stats.admitted++; } else { stats.refused++; to.imm.add(text, a.stage); }
      return a;
    }
    const s = to.sentinel;
    if (typeof text !== 'string' || utf8(text).length > MAX_MSG) { stats.refused++; s.rebound.refused(source); return { admit: false, stage: 'size', why: 'not a message of at most ' + MAX_MSG + ' bytes' }; }   // before anything is hashed
    const bits = s.rebound.owes(source);
    if (!I.paid(source, text, nonce, bits)) { stats.owed++; s.rebound.refused(source); return { admit: false, stage: 'rebound', why: 'this source owes ' + bits + ' bits of work first', bits }; }
    if (s.memory.seen(text)) { stats.onSight++; s.rebound.refused(source); return { admit: false, stage: 'immune', why: 'refused on sight' }; }
    const a = await admit(text, { me: to.org.id, senders: s.trusted, last: (p) => to.inLast.get(p) || 0, grammar: G });
    if (!a.admit) {
      stats.refused++; s.rebound.refused(source); s.memory.add(text, a.stage);
      const c = a.stage === 'counter' ? I.caught(text, s.ledger) : null;   // a replay the signature verified: did the key sign another message on that counter?
      if (c) await expose(to, c.a, c.b, round);
      return a;
    }
    to.inLast.set(a.msg.from, a.msg.n); stats.admitted++;
    s.ledger.keep(a.msg.from, a.msg.n, text);
    s.watch.observe(a.msg.from, a.msg);
    if (a.msg.kind === 'proof') await heed(to, a.msg, round);
    return a;
  }
  /** sign and send one message from a to b. → { ok, msg, text } | { ok: false, why } */
  async function send(a, b, kind, body, round) {
    if (!reach(a, b)) { stats.lost++; log.push({ round, type: 'lost', from: a.name, to: b.name, kind }); return { ok: false, why: 'unreachable' }; }
    const n = (a.outN.get(b.pub) || 0) + 1;
    a.outN.set(b.pub, n);
    const e = await envelope({ kind, to: b.org.id, n, body }, a.keys, G);
    if (!e.ok) return { ok: false, why: e.why };
    stats.sent++;
    const r = await receive(b, e.text, a.name, undefined, round);
    log.push({ round, type: kind, from: a.name, to: b.name, ok: r.admit });
    return r.admit ? { ok: true, msg: r.msg, text: e.text } : { ok: false, why: r.why };
  }
  /** what an admitted advert tells the node that admitted it: a line in its capability map */
  function heard(b, msg) {
    if (msg.kind !== 'advert') return;
    const src = byPub.get(msg.from), [domain, auc, held] = msg.body.split(' ');   // admitted, so from a node of this mesh
    b.map.set(src.name + '|' + domain, { node: src.name, domain, auc: round6(Number(auc)), held: Number(held), v: msg.n });
  }
  /** bytes from outside the mesh's own sends — off a link, with the work they carry — and what they tell the node */
  async function deliver(to, text, source, nonce, round) {
    const r = await receive(to, text, source, nonce, round);
    if (r.admit) heard(to, r.msg);
    return r;
  }
  /** organ 9: a node stops trusting a key — its messages are refused at the sender check from now on, before any
   *  signature is checked, and what it advertised is forgotten. A key already revoked here is left as it is. */
  function revoke(at, pub, why, round) {
    const s = at.sentinel;
    if (!Object.prototype.hasOwnProperty.call(s.trusted, pub)) return;
    const t = { ...s.trusted };
    delete t[pub];
    s.trusted = t; s.revoked.set(pub, { why, round });
    const who = byPub.get(pub);
    for (const k of [...at.map.keys()]) if (at.map.get(k).node === who.name) at.map.delete(k);
    stats.revoked++; log.push({ round, type: 'revoke', from: at.name, to: who.name, why });
  }
  /** a key signed two messages on one counter: revoke it here, and send the proof to every other node. (It is still
   *  trusted here: a refusal on the counter comes after the sender check.) */
  async function expose(at, a, b, round) {
    const from = I.fieldsOf(b).from;
    revoke(at, from, 'proof', round);
    const body = I.proofOf(a, b);
    if (!body) { stats.unshared++; return; }
    for (const q of nodes) if (q !== at && q.pub !== from) await send(at, q, 'proof', body, round);
  }
  /** a proof from a peer is never taken on its word: this node re-builds both messages and checks both signatures */
  async function heed(to, msg, round) {
    const c = await I.checkProof(msg.body, G);
    if (!c.ok) { stats.badProofs++; log.push({ round, type: 'bad-proof', from: byPub.get(msg.from).name, to: to.name, why: c.why }); return; }
    stats.proofs++;
    if (c.from !== to.pub && byPub.has(c.from)) revoke(to, c.from, 'proof from ' + byPub.get(msg.from).name, round);
  }
  /** organ 9, at the end of a round: every node judges every peer's round against that peer's own baseline; a peer
   *  that departs from it by more than honest behaviour does is cut off here (never spread: no other node can re-run it).
   *  → [{ node, peer, verdict, drift, volume }] */
  function watch(round) {
    if (!imm) return [];
    const out = [];
    for (const n of nodes) for (const c of n.sentinel.watch.close(round)) {
      out.push({ node: n.name, ...c, peer: byPub.get(c.peer).name });
      if (c.verdict === 'CUT') revoke(n, c.peer, 'behaviour', round);
    }
    return out;
  }
  /** every live node tells every node it can reach what it has live */
  async function gossip(round) {
    for (const a of nodes) for (const b of nodes) if (a !== b) for (const ad of adverts(a)) {
      const r = await send(a, b, 'advert', ad.domain + ' ' + num(ad.auc) + ' ' + ad.held, round);
      if (r.ok) heard(b, r.msg);
    }
    for (const a of nodes) for (const [k, ad] of a.map) { const src = byName.get(ad.node); if (src && reach(a, src) && !adverts(src).some((x) => x.domain === ad.domain)) a.map.delete(k); }
  }
  /** the nodes a domain's task could go to, best first, by advert and link strength */
  const candidates = (a, domain) => [...a.map.values()].filter((ad) => ad.domain === domain && ad.node !== a.name && byName.has(ad.node))   // only nodes this mesh knows
    .map((ad) => { const e = a.evidence.get(ad.node) || { n: 0, r: 0 }; return { ad, score: opts.learn === 'evidence' ? round6((ad.auc * PRIOR + e.r) / (PRIOR + e.n)) : round6(ad.auc + (a.links.get(ad.node) || 0)) }; }).sort((x, y) => y.score - x.score);   // ties: the first advertised (the sort is stable)
  const bestFor = (a, domain) => candidates(a, domain)[0];

  /**
   * A task arrives at a node: answer it, or route it, and learn from the truth. → { by, verdict, label, right, routed }
   */
  async function task(a, domain, x, truth, round, id) {
    const local = ask(a.body, x, { domain });
    if (local.verdict === 'VERIFIED') { log.push({ round, type: 'answer', from: a.name, domain, ok: local.label === truth }); return { by: a.name, verdict: 'VERIFIED', label: local.label, right: local.label === truth, routed: false }; }
    a.abstains.set(domain, (a.abstains.get(domain) || 0) + 1);
    const cands = candidates(a, domain);
    if (!cands.length) return { by: null, verdict: 'ABSTAIN', right: false, routed: false };
    // explore: now and then (seeded) try another capable node instead of the best, so a better one can be found
    const best = explore && cands.length > 1 && er() < explore ? cands[1 + Math.floor(er() * (cands.length - 1))] : cands[0];
    const b = byName.get(best.ad.node), features = Object.keys(x);   // the domain's own schema, in its own order
    const sent = await send(a, b, 'task', id + ' ' + domain + ' ' + features.map((f) => num(x[f])).join(','), round);
    if (!sent.ok) {   // gone for now: forget what it advertised (it advertises again if it comes back) and weaken the link
      for (const k of [...a.map.keys()]) if (a.map.get(k).node === b.name) a.map.delete(k);
      learn(a, b.name, false);
      return { by: null, verdict: 'ABSTAIN', right: false, routed: true };
    }
    // what b does with the task it admitted: read it in its own copy of the domain's schema, and answer from its own body
    const mine = b.body.patterns[domain] ? b.body.patterns[domain].features : [], vals = sent.msg.body.split(' ')[2].split(',').map(Number);
    const there = ask(b.body, Object.fromEntries(mine.map((f, i) => [f, vals[i]])), { domain });
    const back = await send(b, a, 'reply', id + ' ' + (there.verdict === 'VERIFIED' ? 'VERIFIED ' + there.label + ' ' + num(there.score) : 'ABSTAIN'), round);
    const said = back.ok ? back.msg.body.split(' ') : [];   // a reads the reply it admitted — nothing else
    if (said[1] !== 'VERIFIED') { learn(a, b.name, false); return { by: null, verdict: 'ABSTAIN', right: false, routed: true }; }
    const label = Number(said[2]), right = label === truth;
    learn(a, b.name, right);
    log.push({ round, type: 'answer', from: b.name, to: a.name, domain, ok: right });
    return { by: b.name, verdict: 'VERIFIED', label, right, routed: true };
  }
  /** every link fades a little; one that fades below the floor is dropped */
  function fade(round) {
    if (opts.learn === 'evidence') for (const a of nodes) for (const [b, e] of a.evidence) {   // old evidence counts for less
      const f = { n: round6(e.n * DECAY), r: round6(e.r * DECAY) };
      if (f.n < PRUNE) { a.evidence.delete(b); a.links.delete(b); log.push({ round, type: 'prune', from: a.name, to: b }); } else a.evidence.set(b, f);
    }
    if (opts.learn !== 'evidence') for (const a of nodes) for (const [b, w] of a.links) { const v = round6(w * DECAY); if (v < PRUNE) { a.links.delete(b); log.push({ round, type: 'prune', from: a.name, to: b }); } else a.links.set(b, v); }
  }
  /**
   * Gap-sensing: a node that has abstained GAP times on a domain it holds data for, with no live organ for it, asks the
   * best advertiser for a lesson, weighs it on its own data, and grows the specialist if it clears.
   * → [{ node, domain, from, heldAuc } | { node, domain, refused: why }]
   */
  async function grow(round) {
    const out = [];
    for (const a of nodes) for (const [domain, count] of a.abstains) {
      const has = Object.prototype.hasOwnProperty.call(a.substrate.data || {}, domain), live = a.body.patterns[domain];
      if (count < GAP || !has || live || !a.alive || a.grown.some((g) => g.domain === domain)) continue;
      const best = bestFor(a, domain);
      if (!best) continue;
      const b = byName.get(best.ad.node), recipe = b.org.organs.find((o) => o.domain === domain).recipe;
      const sent = await send(b, a, 'lesson', recipe, round);
      if (!sent.ok) continue;
      const w = weigh(sent.msg, a.org, a.substrate);
      if (!w.adopt) { a.grown.push({ domain, refused: w.why }); out.push({ node: a.name, domain, refused: w.why }); continue; }
      const parent = await open(a.genome), organs = [...parent.fields.organs.filter((o) => !o.includes(' ' + domain + ' ')), recipe];
      const child = await seal({ name: parent.fields.name, parents: [parent.id], gate: parent.fields.gate, organs }, a.keys);
      const g = child.ok ? await germinate(child.text, a.substrate) : child;
      if (!g.ok) { a.grown.push({ domain, refused: g.why }); out.push({ node: a.name, domain, refused: g.why }); continue; }
      a.genome = child.text; a.org = g.organism; a.body = embody(g.organism, a.substrate).body;
      a.grown.push({ domain, from: b.name, heldAuc: w.organ.heldAuc, round });
      log.push({ round, type: 'grow', from: b.name, to: a.name, domain, ok: true });
      out.push({ node: a.name, domain, from: b.name, heldAuc: w.organ.heldAuc });
    }
    return out;
  }
  /** a node that refused bytes tells its neighbours their fingerprint; they refuse the same bytes on sight */
  async function warn(a, text, family, round) {
    const fp = fingerprintOf(text);
    let told = 0;
    for (const b of nodes) if (b !== a) { const r = await send(a, b, 'antibody', fp + ' ' + family, round); if (r.ok) { const [f, fam] = r.msg.body.split(' '); b.imm.adopt(f, fam); told++; } }   // b holds only the fingerprint
    return told;
  }
  return { nodes, byName, send, receive, deliver, gossip, task, fade, grow, warn, watch, bestFor, candidates, log, stats, reach, grammar: G };
}

/** The capability map a node holds, as plain sorted data (for comparing maps across nodes). */
export const mapOf = (n) => [...[...n.map.values()].map((a) => [a.node, a.domain, a.auc]), ...adverts(n).map((a) => [n.name, a.domain, round6(a.auc)])].sort();   // entries are unique; the default order of their text

/** A seeded draw of tasks: held-out cases of the given domains, each arriving at a random node. */
export function tasks(datasets, nodeNames, count, seed) {
  const r = rng(seed), domains = Object.keys(datasets);
  return Array.from({ length: count }, (_, k) => {
    const d = domains[Math.floor(r() * domains.length)], ds = datasets[d], i = ds.heldRows[Math.floor(r() * ds.heldRows.length)];
    return { id: (k + 1).toString(16).padStart(16, '0'), domain: d, row: i, x: caseOf(ds, i), truth: ds.y[i], at: nodeNames[Math.floor(r() * nodeNames.length)] };
  });
}
