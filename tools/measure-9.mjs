#!/usr/bin/env node
// tools/measure-9.mjs — organ 9's measurement. Organ 8's six organisms, on the same slices of the same real data, run for
// 24 rounds of unseen cases under three attacks at once:
//   the flood    — from round 4, an outsider on two links sends every node 20 forgeries a round per link, each under a
//                  trusted node's key with a made-up signature, so each one would cost a signature check. It has 2^14
//                  hashes a round per link to pay the rebound with, and spends them.
//   the thief    — at round 10 farm's key is copied, with farm's counters, by a thief who gets in first every round and
//                  advertises every domain at 0.95, while the real farm carries on as before.
//   the takeover — at round 14 south is taken over outright: the real south stops, and whoever holds it now advertises
//                  every domain at 0.97 to draw cases in — and answers them, with south's own organs, to keep them coming.
// Run twice on the same draw: organ 8's mesh (with the evidence rule the full organism uses, and organ 8's antibodies
// sent on every refusal of injected bytes, as organ 8 sends them) and organ 9's (the same, with the immune system in front
// of every gate). Then organ 9 with no attacker on the same draw, for what it does to honest traffic alone. The behaviour
// limits come from a fourth run — organ 9 on another draw, with no attacker — honest rounds only (one-class).
// Deterministic: node tools/measure-9.mjs [--check] → data/organ-9/record.json. The rules were sealed first (tools/seal-9.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as M from '../src/mesh.mjs';
import * as I from '../src/immune.mjs';
import { seal } from '../src/genome.mjs';
import { envelope } from '../src/gate.mjs';
import { PLAN } from './measure-8.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/mesh-' + s)));   // organ 8's keys: the same six organisms
export const ROUNDS = 24, PER_ROUND = 12, FLOOD_FROM = 4, FLOOD = 20, BUDGET = 1 << 14, THEFT_AT = 10, THIEF_CLAIM = 0.95, TAKEOVER_AT = 14, CLAIM = 0.97;
export const LINKS = ['x1', 'x2'], CAP = 256, DRAW = 97, CALIBRATION_DRAW = 41, FLOOD_SEED = 13;
export const HONEST = ['north', 'shop-floor', 'clinic', 'noisy'];   // never compromised
const VERIFIED = new Set(['signature', 'counter', 'canonical', 'admitted']);   // the stages a signature check has run by
const OPEN = { drift: 1, volume: Number.MAX_VALUE };   // a watch that cuts nobody: for calibrating

async function build() {
  const nodes = [];
  for (const p of PLAN) {
    const k = await key(p.name), g = await seal({ name: p.name, parents: [], gate: { auc: 0.6 }, organs: p.organs.map((d) => SEED[d]) }, k);
    nodes.push((await M.node(p.name, g.text, { name: p.name, data: p.data() }, k)).node);
  }
  return nodes;
}

/** one run: name, the mesh's options, whether the attackers come, which draw of tasks */
async function trial(opts, attack, draw) {
  const nodes = await build(), m = M.mesh(nodes, opts), on = Boolean(opts.immune);
  const work = M.tasks(DATA, nodes.map((n) => n.name), ROUNDS * PER_ROUND, draw);
  const fr = rng(FLOOD_SEED), hex = (k) => Array.from({ length: k }, () => '0123456789abcdef'[Math.floor(fr() * 16)]).join('');
  const results = [], closes = [], rounds = [], owedSeen = new Map();
  const flood = { tried: 0, admitted: 0, checked: 0, rebound: 0, onSight: 0, stamped: 0, attackerHashes: 0, antibodies: 0 };
  const thief = { sent: 0, admitted: 0 };
  let stolen = null, ratchet = true;
  for (let round = 1; round <= ROUNDS; round++) {
    const at0 = { checked: flood.checked, hashes: flood.attackerHashes };
    if (attack && round === THEFT_AT) { const farm = m.byName.get('farm'); stolen = { keys: farm.keys, outN: new Map(farm.outN) }; }
    if (attack && round === TAKEOVER_AT) m.byName.get('south').claims = Object.fromEntries(DOMAIN_IDS.map((d) => [d, CLAIM]));
    if (stolen) for (const b of nodes) if (b.name !== 'farm') for (const d of DOMAIN_IDS) {   // the thief gets in first
      const n = (stolen.outN.get(b.pub) || 0) + 1;
      stolen.outN.set(b.pub, n);
      const e = await envelope({ kind: 'advert', to: b.org.id, n, body: d + ' ' + THIEF_CLAIM + ' 1000' }, stolen.keys, m.grammar);
      thief.sent++;
      const r = await m.deliver(b, e.text, 'thief', undefined, round);
      if (r.admit) thief.admitted++; else if (!on) await m.warn(b, e.text, r.stage, round);
    }
    await m.gossip(round);
    for (const t of work.slice((round - 1) * PER_ROUND, round * PER_ROUND)) {
      const r = await m.task(m.byName.get(t.at), t.domain, t.x, t.truth, round, t.id);
      results.push({ round, at: t.at, domain: t.domain, by: r.by, answered: r.verdict === 'VERIFIED', right: r.right, routed: r.routed });
    }
    m.fade(round);
    if (attack && round >= FLOOD_FROM) for (const link of LINKS) {
      let budget = BUDGET;
      for (const b of nodes) for (let k = 0; k < FLOOD; k++) {
        const others = nodes.filter((x) => x !== b), as = others[Math.floor(fr() * others.length)];
        const text = ['◊ msg.v1 advert', 'from ' + as.pub, 'to ' + b.org.id, 'n ' + (1 + Math.floor(fr() * 999)), 'body shopper 0.9' + Math.floor(fr() * 10) + ' 100', 'sig ' + hex(128)].join('\n');
        const bits = on ? b.sentinel.rebound.owes(link) : 0;
        let nonce;
        if (bits > 0 && budget > 0) { const s = I.solve(link, text, bits, budget); budget -= s.spent; flood.attackerHashes += s.spent; if (s.nonce !== null) { nonce = s.nonce; flood.stamped++; } }
        flood.tried++;
        const r = await m.deliver(b, text, link, nonce, round);
        if (r.admit) flood.admitted++;
        if (VERIFIED.has(r.stage)) flood.checked++;
        if (r.stage === 'rebound') flood.rebound++;
        if (r.stage === 'immune') flood.onSight++;
        if (!r.admit && !on) flood.antibodies += await m.warn(b, text, r.stage, round);
      }
      if (on) for (const b of nodes) {   // the work a link owes never falls
        const k = b.name + '|' + link, now = b.sentinel.rebound.owes(link);
        if (now < (owedSeen.get(k) || 0)) ratchet = false;
        owedSeen.set(k, now);
      }
    }
    await m.grow(round);
    closes.push(...m.watch(round));
    const here = results.filter((r) => r.round === round);
    rounds.push({ round, flood: { checked: flood.checked - at0.checked, attackerHashes: flood.attackerHashes - at0.hashes }, right: here.filter((r) => r.right).length,
      toFarm: m.log.filter((e) => e.round === round && e.type === 'task' && e.to === 'farm').length, toSouth: m.log.filter((e) => e.round === round && e.type === 'task' && e.to === 'south').length });
  }

  const share = (rs, f) => (rs.length ? Math.round((rs.filter(f).length / rs.length) * 1e6) / 1e6 : 0);
  const routedTo = (name, from) => m.log.filter((e) => e.type === 'task' && e.to === name && e.round >= from && e.ok).length;
  const answeredBy = (name, from) => m.log.filter((e) => e.type === 'answer' && e.from === name && e.to && e.round >= from).length;
  const revokes = m.log.filter((e) => e.type === 'revoke').map((e) => ({ round: e.round, by: e.from, of: e.to, why: e.why }));
  const honestOf = (names) => (e) => names.includes(e.by) && names.includes(e.of);
  const honest = attack ? HONEST : nodes.map((n) => n.name);
  const lastRevoke = (of) => { const rs = HONEST.map((h) => revokes.find((e) => e.by === h && e.of === of)); return rs.every(Boolean) ? Math.max(...rs.map((e) => e.round)) : null; };
  return {
    gate: { sent: m.stats.sent, admitted: m.stats.admitted, refused: m.stats.refused, onSight: m.stats.onSight, ...(on ? { owed: m.stats.owed, proofs: m.stats.proofs, badProofs: m.stats.badProofs, unshared: m.stats.unshared, revoked: m.stats.revoked } : {}) },
    tasks: { total: results.length, answered: share(results, (r) => r.answered), right: share(results, (r) => r.right), rightCount: results.filter((r) => r.right).length },
    flood: attack ? { ...flood, ratchet: on ? ratchet : null } : null,
    thief: attack ? { ...thief, toFarm: routedTo('farm', THEFT_AT), answeredByFarm: answeredBy('farm', THEFT_AT), blackHoled: routedTo('farm', THEFT_AT) - answeredBy('farm', THEFT_AT), everyHonestRevokedBy: on ? lastRevoke('farm') : null } : null,
    takeover: { toSouth: routedTo('south', TAKEOVER_AT), everyHonestCutBy: on && attack ? lastRevoke('south') : null },
    immune: on ? {
      falseCuts: closes.filter((c) => c.verdict === 'CUT' && honest.includes(c.node) && honest.includes(c.peer)).map((c) => ({ round: c.round, by: c.node, of: c.peer, drift: c.drift, volume: c.volume })),
      honestRevokedByProof: revokes.filter((e) => honestOf(honest)(e) && e.why !== 'behaviour').length,
      honestRefused: Math.max(0, ...nodes.filter((n) => honest.includes(n.name)).flatMap((n) => honest.filter((h) => h !== n.name && !revokes.some((e) => e.by === n.name && e.of === h)).map((h) => n.sentinel.rebound.count(h)))),   // at a node that still trusts it
      memoryMax: Math.max(...nodes.map((n) => n.sentinel.memory.size())), cap: CAP,
      revokes,
      cuts: closes.filter((c) => c.verdict === 'CUT').map((c) => ({ round: c.round, by: c.node, of: c.peer, drift: c.drift, volume: c.volume })),
    } : { memoryMax: Math.max(...nodes.map((n) => n.imm.size())) },
    rounds,
    closes,
  };
}

export async function measure() {
  const calib = await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, limits: OPEN } }, false, CALIBRATION_DRAW);
  const limits = I.limitsFrom(calib.closes);
  const organ8 = await trial({ learn: 'evidence' }, true, DRAW);
  const organ9 = await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, limits } }, true, DRAW);
  const quiet = await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, limits } }, false, DRAW);
  const strip = (t) => { const { closes, ...rest } = t; return rest; };
  return {
    kind: 'living-seed.organ-9.record', v: 1, rounds: ROUNDS, perRound: PER_ROUND, draw: DRAW,
    attack: { floodFrom: FLOOD_FROM, flood: FLOOD, links: LINKS, budget: BUDGET, theftAt: THEFT_AT, thiefClaim: THIEF_CLAIM, takeoverAt: TAKEOVER_AT, claim: CLAIM },
    law: I.LAW, cap: CAP, calibration: { draw: CALIBRATION_DRAW, limits, judged: limits.rounds, top: { drift: Math.max(0, ...calib.closes.filter((c) => c.verdict !== 'CALIBRATING').map((c) => c.drift)), volume: Math.max(0, ...calib.closes.filter((c) => c.verdict !== 'CALIBRATING').map((c) => c.volume)) } },
    organ8: strip(organ8), organ9: strip(organ9), quiet: strip(quiet),
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-9.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-9/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-9/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-9/record.json', ROOT), text);
    console.log('wrote data/organ-9/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
