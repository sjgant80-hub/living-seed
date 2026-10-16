#!/usr/bin/env node
// tools/measure-8.mjs — organ 8's measurement: a mesh of six organisms, each on its own slice of the real domains, run
// for 24 rounds of unseen cases — with an attack, two nodes lost and a partition healed. Deterministic (seeded draws,
// seeded keys, deterministic signatures): node tools/measure-8.mjs [--check] → data/organ-8/record.json.
// The rules were sealed first (tools/seal-8.mjs). The full event log is written for the page's live view.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as M from '../src/mesh.mjs';
import { seal } from '../src/genome.mjs';
import { ask } from '../src/body.mjs';
import { envelope } from '../src/gate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const run = JSON.parse(read('data/seed-library-run.json'));
const SEED = Object.fromEntries(run.library.seeds.map((s) => [s.domain, s.seed]));
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
const key = (s) => fromSeed(sha256Bytes(utf8('living-seed/maker/mesh-' + s)));
export const ROUNDS = 24, PER_ROUND = 12, LOSS_AT = 12, CUT = [16, 20], ATTACK_AT = 6;
const third = (ds, k) => ({ ...ds, trainRows: ds.trainRows.filter((i) => i % 3 === k) });
function shuffledShop() {
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  return { ...DATA.shopper, y };
}

/** the six nodes: name, the organs its genome carries, and the data its device holds */
export const PLAN = [
  { name: 'north', organs: DOMAIN_IDS, data: () => Object.fromEntries(DOMAIN_IDS.map((d) => [d, third(DATA[d], 0)])) },
  { name: 'south', organs: DOMAIN_IDS, data: () => Object.fromEntries(DOMAIN_IDS.map((d) => [d, third(DATA[d], 1)])) },
  { name: 'shop-floor', organs: DOMAIN_IDS, data: () => ({ shopper: third(DATA.shopper, 2) }) },
  { name: 'clinic', organs: ['shopper', 'water', 'crop'], data: () => ({ triage: third(DATA.triage, 2), water: third(DATA.water, 2) }) },
  { name: 'farm', organs: ['crop'], data: () => ({ crop: third(DATA.crop, 2), shopper: third(DATA.shopper, 0) }) },
  { name: 'noisy', organs: DOMAIN_IDS, data: () => ({ shopper: shuffledShop(), water: third(DATA.water, 0) }) },
];

export async function measure() {
  const nodes = [];
  for (const p of PLAN) {
    const k = await key(p.name), g = await seal({ name: p.name, parents: [], gate: { auc: 0.6 }, organs: p.organs.map((d) => SEED[d]) }, k);
    nodes.push((await M.node(p.name, g.text, { name: p.name, data: p.data() }, k)).node);
  }
  const cut = { on: false }, west = new Set(['north', 'clinic', 'farm']);
  const m = M.mesh(nodes, { cut: (a, b) => cut.on && west.has(a) !== west.has(b) });
  const work = M.tasks(DATA, nodes.map((n) => n.name), ROUNDS * PER_ROUND, 81);
  const results = [], grown = [], phases = { before: [], after: [] };
  const attack = { tried: 0, admitted: 0, warnedNodes: 0, onSightAfter: 0, replayedTo: 0 };

  for (let round = 1; round <= ROUNDS; round++) {
    if (round === LOSS_AT) for (const name of ['south', 'shop-floor']) m.byName.get(name).alive = false;
    cut.on = round >= CUT[0] && round < CUT[1];
    await m.gossip(round);
    for (const t of work.slice((round - 1) * PER_ROUND, round * PER_ROUND)) {
      let at = m.byName.get(t.at);
      if (!at.alive) at = nodes.filter((n) => n.alive)[Number(t.id.slice(-2)) % nodes.filter((n) => n.alive).length];   // tasks only reach live nodes
      const alone = ask(at.body, t.x, { domain: t.domain });   // what this node would have done on its own
      const r = await m.task(at, t.domain, t.x, t.truth, round, t.id);
      const rec = { round, at: at.name, domain: t.domain, by: r.by, answered: r.verdict === 'VERIFIED', right: r.right, routed: r.routed, alone: alone.verdict === 'VERIFIED', aloneRight: alone.verdict === 'VERIFIED' && alone.label === t.truth };
      results.push(rec); (round < LOSS_AT ? phases.before : phases.after).push(rec);
    }
    m.fade(round);
    for (const g of await m.grow(round)) grown.push({ round, ...g });

    if (round === ATTACK_AT) {
      // an outsider forges a task to every node; then a message under south's own key on a counter already spent (a replay)
      const stranger = await key('stranger');
      for (const n of nodes) {
        const f = await envelope({ kind: 'task', to: n.org.id, n: 1, body: 'f'.repeat(16) + ' shopper 1,2,3,4,5,6,7,8,9,10' }, stranger, M.MESH);
        attack.tried++; const r = await m.receive(n, f.text); if (r.admit) attack.admitted++; else attack.warnedNodes += await m.warn(n, f.text, r.stage, round);
      }
      const south = m.byName.get('south'), north = m.byName.get('north');
      const real = await envelope({ kind: 'advert', to: north.org.id, n: 1, body: 'shopper 0.9 100' }, south.keys, M.MESH);   // counter 1 to north is long spent
      attack.tried++; const first = await m.receive(north, real.text); if (first.admit) attack.admitted++; else attack.warnedNodes += await m.warn(north, real.text, first.stage, round);
      for (const n of nodes) if (n !== north) { attack.replayedTo++; const r = await m.receive(n, real.text); if (r.admit) attack.admitted++; else if (r.stage === 'immune') attack.onSightAfter++; }
    }
  }

  const share = (rs, f) => rs.length ? Math.round((rs.filter(f).length / rs.length) * 1e6) / 1e6 : 0;
  const answeredAlone = results.filter((r) => r.alone);
  // after a specialist grew, how its node answered that domain at home, against the routed answers before it
  const specialists = grown.filter((g) => g.from).map((g) => {
    const after = results.filter((r) => r.at === g.node && r.domain === g.domain && r.round > g.round), before = results.filter((r) => r.at === g.node && r.domain === g.domain && r.round <= g.round && r.routed);
    return { node: g.node, domain: g.domain, from: g.from, round: g.round, heldAuc: g.heldAuc, afterTasks: after.length, afterAtHome: after.filter((r) => !r.routed).length, afterRight: share(after, (r) => r.right), routedBefore: before.length, routedBeforeRight: share(before, (r) => r.right) };
  });
  const late = results.filter((r) => r.round > ROUNDS - 8 && r.routed && r.answered), concentration = {};
  for (const d of DOMAIN_IDS) { const rs = late.filter((r) => r.domain === d); if (!rs.length) continue; const by = {}; for (const r of rs) by[r.by] = (by[r.by] || 0) + 1; const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0]; concentration[d] = { routed: rs.length, top: top[0], share: Math.round((top[1] / rs.length) * 1e6) / 1e6 }; }
  const alive = nodes.filter((n) => n.alive), maps = alive.map((n) => JSON.stringify(M.mapOf(n).filter((e) => m.byName.get(e[0]).alive)));
  return {
    kind: 'living-seed.organ-8.record', v: 1, rounds: ROUNDS, perRound: PER_ROUND, nodes: PLAN.map((p) => ({ name: p.name, organs: p.organs, data: Object.keys(p.data()) })),
    gate: { sent: m.stats.sent, admitted: m.stats.admitted, refused: m.stats.refused, lost: m.stats.lost, onSight: m.stats.onSight },
    attack,
    tasks: { total: results.length, answered: share(results, (r) => r.answered), right: share(results.filter((r) => r.answered), (r) => r.right), routed: share(results, (r) => r.routed),
      alone: { answered: share(results, (r) => r.alone), right: share(answeredAlone, (r) => r.aloneRight) },
      before: { answered: share(phases.before, (r) => r.answered) }, after: { answered: share(phases.after, (r) => r.answered) } },
    grown, specialists, concentration,
    healed: { identical: new Set(maps).size === 1, nodes: alive.map((n) => n.name) },
    links: Object.fromEntries(nodes.map((n) => [n.name, Object.fromEntries([...n.links].sort())])),
    events: m.log.length,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-8.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-8/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-8/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-8/record.json', ROOT), text);
    console.log('wrote data/organ-8/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
