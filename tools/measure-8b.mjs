#!/usr/bin/env node
// tools/measure-8b.mjs — organ 8, the fair learning test: two capable shop nodes stay alive the whole time; one has a
// miscalibrated sensor (it records time on product pages in minutes, not seconds), so it advertises a good score on its
// own data but cannot serve normal cases well; it sits on the history slice whose advert is highest, so routing starts
// with it. Three askers with no shop organ route every shop task. The same scenario runs under three routing policies:
// organ 8's rule (saturating links, always the best), the reliability rule (links track being right), and the
// reliability rule with exploring. Deterministic. node tools/measure-8b.mjs [--check] → data/organ-8b/record.json
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
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/learn-' + s)));
export const ROUNDS = 30, PER_ROUND = 9, LATE = 10;
export const POLICIES = [
  { name: 'organ 8’s rule', opts: {} },
  { name: 'reliability', opts: { learn: 'ema' } },
  { name: 'reliability + exploring', opts: { learn: 'ema', explore: 0.2, seed: 5 } },
];
const third = (ds, k) => ({ ...ds, trainRows: ds.trainRows.filter((i) => i % 3 === k) });
const minutes = (ds) => ({ ...ds, cols: { ...ds.cols, ProductRelated_Duration: Float64Array.from(ds.cols.ProductRelated_Duration, (v) => v / 60) } });

async function build() {
  const plan = [
    { name: 'west', organs: ['shopper'], data: { shopper: third(DATA.shopper, 0) } },                 // accurate
    { name: 'east', organs: ['shopper'], data: { shopper: minutes(third(DATA.shopper, 1)) } },        // miscalibrated: minutes
    ...['a1', 'a2', 'a3'].map((name, k) => ({ name, organs: ['crop'], data: { crop: third(DATA.crop, k) } })),
  ];
  const nodes = [];
  for (const p of plan) { const k = await key(p.name), g = await seal({ name: p.name, parents: [], gate: { auc: 0.6 }, organs: p.organs.map((d) => SEED[d]) }, k); nodes.push((await M.node(p.name, g.text, { name: p.name, data: p.data }, k)).node); }
  return nodes;
}

export async function measure() {
  const shop = DATA.shopper, work = M.tasks({ shopper: shop }, ['a1', 'a2', 'a3'], ROUNDS * PER_ROUND, 88);
  // the premise: asked directly, how often each shop node is right on these very tasks
  const [west, east] = (await build()).slice(0, 2);
  const direct = (n) => work.filter((t) => { const a = ask(n.body, t.x, { domain: 'shopper' }); return a.verdict === 'VERIFIED' && a.label === t.truth; }).length / work.length;
  const premise = { adverts: { west: M.adverts(west)[0].auc, east: M.adverts(east)[0].auc }, rightDirect: { west: Math.round(direct(west) * 1e6) / 1e6, east: Math.round(direct(east) * 1e6) / 1e6 },
    eastAbstains: work.filter((t) => ask(east.body, t.x, { domain: 'shopper' }).verdict !== 'VERIFIED').length };
  const policies = [];
  for (const p of POLICIES) {
    const nodes = await build(), m = M.mesh(nodes, p.opts), rounds = [];
    for (let round = 1; round <= ROUNDS; round++) {
      await m.gossip(round);
      const rs = [];
      for (const t of work.slice((round - 1) * PER_ROUND, round * PER_ROUND)) rs.push(await m.task(m.byName.get(t.at), 'shopper', t.x, t.truth, round, t.id));
      m.fade(round);
      rounds.push({ round, routed: rs.filter((r) => r.routed).length, toWest: rs.filter((r) => r.by === 'west').length, right: rs.filter((r) => r.right).length });
    }
    const late = rounds.slice(-LATE), early = rounds.slice(0, LATE), sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
    policies.push({ name: p.name, opts: p.opts, gate: { sent: m.stats.sent, admitted: m.stats.admitted },
      early: { routed: sum(early, 'routed'), toWest: sum(early, 'toWest'), right: sum(early, 'right'), tasks: early.length * PER_ROUND },
      late: { routed: sum(late, 'routed'), toWest: sum(late, 'toWest'), right: sum(late, 'right'), tasks: late.length * PER_ROUND },
      links: Object.fromEntries(['a1', 'a2', 'a3'].map((a) => [a, Object.fromEntries([...m.byName.get(a).links].sort())])), rounds });
  }
  return { kind: 'living-seed.organ-8b.record', v: 1, rounds: ROUNDS, perRound: PER_ROUND, late: LATE, premise, policies };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-8b.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-8b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-8b/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-8b/record.json', ROOT), text);
    console.log('wrote data/organ-8b/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
