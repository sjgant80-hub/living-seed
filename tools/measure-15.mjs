#!/usr/bin/env node
// tools/measure-15.mjs — organ 15's measurement: the self-similar stack, one gap. Nature keeps a body stable with
// homeostasis — a dead band it does not react inside, and a change only when the signal persists. The organism's own
// gap is the same one: self-improvement that adopts a gain which is only noise (organs 4 and 11 found it; the nights were
// built against it). Two adoption rules, the same ten nights, the same seeds and data:
//   naive        — organ 11's rule: adopt a child that beats the organ on October alone by the fixed margin (z = 0)
//   homeostatic  — the nights' rule: the gain must exceed twice its own noise (z = 2) and, from night 2, hold on August,
//                  September and October each on its own — a dead band, and persistence
// Each lineage starts from organ 1's origin and moves only to a child its own rule adopted; after every night both are
// scored on November–December, which never steers a choice. The homeostatic lineage IS the committed nights
// (data/nights/1..10), read from their records and checked against them; the naive lineage is run here.
//   node tools/measure-15.mjs [--check] | --smoke
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as O from '../src/organism.mjs';
import * as A from '../src/align.mjs';
import { open } from '../src/genome.mjs';
import { auc, round6 } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { GENOME } from './measure-10.mjs';
import { key, months, device, stream } from './measure-11.mjs';
import { EVOLVE } from './night.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const SMOKE = process.argv.includes('--smoke');
export const NIGHTS = SMOKE ? 2 : 10;
const evolveOf = (n) => (SMOKE ? { generations: 2, children: 2, folds: 3, seed: 100 + n } : { ...EVOLVE, seed: 100 + n });

async function scorer() {
  const hist = device(0, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') }), final = stream(0, 'Nov', 'Dec');
  return async (g) => {
    const l = await A.life(g, hist, final, { checks: A.CHECKS }), ans = l.ledger.filter((e) => e.act.kind === 'answer');
    return { id: (await open(g)).id, finalAuc: round6(auc(ans.map((e) => e.act.receipt.score), ans.map((e) => final[e.act.at].truth))) };
  };
}

/** organ 11's rule, one night: evolve on Feb–May + Aug–Sep, adopt on October alone by the fixed margin (z = 0) */
async function naiveNight(before, n, devA, trust) {
  const hist = device(0, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') });
  const r = await O.improve(before, hist, devA, { trust, evolve: evolveOf(n), z: 0 });
  const adopted = r.organs.some((o) => o.adopted);
  return { adopted, after: adopted ? r.child : before };
}

export async function measure() {
  const maker = await key('origin'), devA = await key('device-a-11'), trust = [maker.pub, devA.pub], score = await scorer();
  const origin = await score(GENOME);

  // the naive lineage, run here
  let champ = GENOME;
  const naive = [];
  for (let n = 1; n <= NIGHTS; n++) {
    const before = await score(champ), r = await naiveNight(champ, n, devA, trust), after = r.adopted ? await score(r.after) : before;
    naive.push({ night: n, adopted: r.adopted, before: before.finalAuc, after: after.finalAuc, id: after.id });
    champ = r.after;
  }

  // the homeostatic lineage: the committed nights, read from their records
  const home = [];
  for (let n = 1; n <= NIGHTS; n++) {
    const rec = JSON.parse(read('data/nights/' + n + '/record.json'));
    home.push({ night: n, adopted: rec.adopted, before: rec.before.finalAuc, after: rec.after.finalAuc, id: rec.after.id });
  }
  // the chain is unbroken: each committed night starts from the champion the night before left
  const chained = home.every((x, i) => i === 0 || JSON.parse(read('data/nights/' + x.night + '/record.json')).previous === home[i - 1].id);

  const sum = (rows) => {
    const adopts = rows.filter((x) => x.adopted);
    return { adoptions: adopts.length, harmful: adopts.filter((x) => x.after < x.before).length, finalAuc: rows[rows.length - 1].after, startAuc: rows[0].before };
  };
  return {
    kind: 'living-seed.organ-15.record', v: 1, nights: NIGHTS, origin: origin.finalAuc,
    naive: { rule: 'organ 11: October alone, the fixed margin (z = 0)', perNight: naive, ...sum(naive) },
    homeostatic: { rule: 'the nights: past twice the noise (z = 2), and from night 2 on each of Aug, Sep, Oct', perNight: home, chained, ...sum(home) },
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-15.mjs');
if (isMain) {
  const t0 = Date.now(), rec = await measure();
  if (SMOKE) { console.log('SMOKE RAN · ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · keys ' + Object.keys(rec).join(' ') + ' · naive nights ' + rec.naive.perNight.length + ' · home chained ' + rec.homeostatic.chained); process.exit(0); }
  const text = JSON.stringify(rec, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    if (read('data/organ-15/record.json') !== text) { console.log('RECORD MISMATCH · re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  } else {
    mkdirSync(new URL('data/organ-15/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-15/record.json', ROOT), text);
    console.log('wrote data/organ-15/record.json · ' + sha256Hex(text).slice(0, 16) + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  }
}
