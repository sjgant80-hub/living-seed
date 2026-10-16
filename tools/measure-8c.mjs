#!/usr/bin/env node
// tools/measure-8c.mjs — organ 8, the fair learning test, third attempt (8b's premise failed: its faulty node was not
// worse). Two crop nodes stay alive throughout. west is honest: the origin crop organ on a third of the crop history.
// east OVER-CLAIMS: its organ is a weak recipe that barely clears the gate on its own third, and it advertises 0.90 —
// a broken or dishonest node, the case the trust rail exists for. Three askers hold no crop data and route every crop
// task. One scenario, four policies: organ 8's rule, the reliability rule, reliability with exploring, and the evidence
// rule (an advert counts as 4 cases; what a route actually did decides). Deterministic.
//   node tools/measure-8c.mjs [--check] → data/organ-8c/record.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as M from '../src/mesh.mjs';
import { seal } from '../src/genome.mjs';
import { ask } from '../src/body.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/claim-' + s)));
export const ROUNDS = 30, PER_ROUND = 9, LATE = 10, CLAIM = 0.9;
export const WEAK = '◊ seed.v1 crop 1 f:23f5d2506a7ef5a44c08 5fda633bd073';   // a random recipe that barely clears the gate
export const POLICIES = [
  { name: 'organ 8’s rule', opts: {} },
  { name: 'reliability', opts: { learn: 'ema' } },
  { name: 'reliability + exploring', opts: { learn: 'ema', explore: 0.2, seed: 5 } },
  { name: 'evidence', opts: { learn: 'evidence' } },
];
const third = (ds, k) => ({ ...ds, trainRows: ds.trainRows.filter((i) => i % 3 === k) });

async function build() {
  const plan = [
    { name: 'west', organs: [SEED.crop], data: { crop: third(DATA.crop, 0) } },
    { name: 'east', organs: [WEAK], data: { crop: third(DATA.crop, 1) }, claims: { crop: CLAIM } },
    ...['a1', 'a2', 'a3'].map((name, k) => ({ name, organs: [SEED.shopper], data: { shopper: third(DATA.shopper, k) } })),
  ];
  const nodes = [];
  for (const p of plan) {
    const k = await key(p.name), g = await seal({ name: p.name, parents: [], gate: { auc: 0.6 }, organs: p.organs }, k);
    const n = (await M.node(p.name, g.text, { name: p.name, data: p.data }, k)).node;
    if (p.claims) n.claims = p.claims;
    nodes.push(n);
  }
  return nodes;
}

export async function measure() {
  const work = M.tasks({ crop: DATA.crop }, ['a1', 'a2', 'a3'], ROUNDS * PER_ROUND, 89);
  const [west, east] = (await build()).slice(0, 2);
  const direct = (n) => Math.round((work.filter((t) => { const a = ask(n.body, t.x, { domain: 'crop' }); return a.verdict === 'VERIFIED' && a.label === t.truth; }).length / work.length) * 1e6) / 1e6;
  const premise = { adverts: { west: M.adverts(west)[0].auc, east: M.adverts(east)[0].auc }, eastReal: east.org.organs[0].heldAuc, rightDirect: { west: direct(west), east: direct(east) } };
  const policies = [];
  for (const p of POLICIES) {
    const nodes = await build(), m = M.mesh(nodes, p.opts), rounds = [];
    for (let round = 1; round <= ROUNDS; round++) {
      await m.gossip(round);
      const rs = [];
      for (const t of work.slice((round - 1) * PER_ROUND, round * PER_ROUND)) rs.push(await m.task(m.byName.get(t.at), 'crop', t.x, t.truth, round, t.id));
      m.fade(round);
      rounds.push({ round, routed: rs.filter((r) => r.routed).length, toWest: rs.filter((r) => r.by === 'west').length, right: rs.filter((r) => r.right).length });
    }
    const pick = (rs) => ({ routed: rs.reduce((a, r) => a + r.routed, 0), toWest: rs.reduce((a, r) => a + r.toWest, 0), right: rs.reduce((a, r) => a + r.right, 0), tasks: rs.length * PER_ROUND });
    const firstWest = (rounds.find((r) => r.toWest > 0) || { round: null }).round;
    policies.push({ name: p.name, opts: p.opts, gate: { sent: m.stats.sent, admitted: m.stats.admitted }, early: pick(rounds.slice(0, LATE)), late: pick(rounds.slice(-LATE)), firstRoundToWest: firstWest, rounds });
  }
  return { kind: 'living-seed.organ-8c.record', v: 1, rounds: ROUNDS, perRound: PER_ROUND, late: LATE, claim: CLAIM, weak: WEAK, premise, policies };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-8c.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-8c/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-8c/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-8c/record.json', ROOT), text);
    console.log('wrote data/organ-8c/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
