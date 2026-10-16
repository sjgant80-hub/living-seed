#!/usr/bin/env node
// tools/measure.mjs — organ 1's measurement: seal the first genome, germinate it on six substrates, attack it, and write
// every number to data/record.json. Deterministic (seeded maker keys, no clock), so anyone re-runs it to the same bytes:
//   node tools/measure.mjs           → writes data/record.json
//   node tools/measure.mjs --check   → re-runs and refuses unless the committed record is reproduced byte for byte
// The rules it is judged against, and the predictions, were sealed first (data/prereg.json, tools/seal.mjs).
import { readFileSync, writeFileSync } from 'node:fs';
import { seal, open } from '../src/genome.mjs';
import { germinate, answer, caseOf, sizes, stable } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8, sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const sealedRun = JSON.parse(read('data/seed-library-run.json'));
const SEEDS = sealedRun.library.seeds.map((s) => s.seed);
const CSV = read('data/online_shoppers_intention.csv');
const DATA = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: CSV })]));
const shard = (ds, keep) => ({ ...ds, trainRows: ds.trainRows.filter(keep) });

export async function measure() {
  const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
  const other = await fromSeed(sha256Bytes(utf8('living-seed/maker/other')));
  const genome = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS }, maker);
  const body = genome.text.slice(0, genome.text.lastIndexOf('\nby '));

  // the substrates: the reference data, two devices holding the two halves of the history, a device whose shopper labels
  // carry no signal, a device with no water data
  const r = rng(9), y = Uint8Array.from(DATA.shopper.y);
  for (let i = y.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [y[i], y[j]] = [y[j], y[i]]; }
  const { water, ...noWater } = DATA;
  const substrates = [
    { name: 'reference', data: DATA },
    { name: 'device-a', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 0)])) },
    { name: 'device-b', data: Object.fromEntries(DOMAIN_IDS.map((d) => [d, shard(DATA[d], (i) => i % 2 === 1)])) },
    { name: 'shuffled-shopper', data: { ...DATA, shopper: { ...DATA.shopper, y } } },
    { name: 'no-water', data: noWater },
  ];

  // germinate each with the network trapped for the whole of it, the seal check included
  const g = globalThis, saved = { fetch: g.fetch, XMLHttpRequest: g.XMLHttpRequest, WebSocket: g.WebSocket, importScripts: g.importScripts };
  let touched = 0;
  const trap = () => { touched++; throw new Error('network'); };
  const organisms = {};
  Object.assign(g, { fetch: trap, XMLHttpRequest: function () { trap(); }, WebSocket: function () { trap(); }, importScripts: trap });
  try { for (const s of substrates) organisms[s.name] = (await germinate(genome.text, s)).organism; } finally { Object.assign(g, saved); }

  // what each organism answers on every case of every domain it was never grown on (the same held cases everywhere)
  const calls = (o) => Object.fromEntries(DOMAIN_IDS.map((d) => {
    const ds = DATA[d];
    let verified = 0, right = 0;
    for (const i of ds.heldRows) {
      const a = answer(o, d, caseOf(ds, i));
      if (a.verdict === 'VERIFIED') { verified++; if (a.label === (o.substrate === 'shuffled-shopper' && d === 'shopper' ? y[i] : ds.y[i])) right++; }
    }
    return [d, { held: ds.heldRows.length, verified, abstained: ds.heldRows.length - verified, right }];
  }));
  const organ = (o) => o.organs.map((x) => ({ domain: x.domain, state: x.state, why: x.why, ...(x.heldAuc === undefined ? {} : { heldAuc: x.heldAuc, heldAcc: x.heldAcc, train: x.train, held: x.held }) }));
  const grown = Object.fromEntries(Object.entries(organisms).map(([n, o]) => [n, { id: o.id, organs: organ(o), calls: calls(o), sizes: sizes(genome.text, o) }]));

  // the seal under attack: one character changed at every position; the maker's key swapped; another maker; trust lists
  let refusedEverywhere = 0;
  const reasons = {};
  for (let i = 0; i < genome.text.length; i++) {
    const c = genome.text[i];
    const t = genome.text.slice(0, i) + (c === 'a' ? 'b' : c === '\n' ? ' ' : c === '0' ? '1' : 'a') + genome.text.slice(i + 1);
    const o = await open(t);
    if (!o.ok) { refusedEverywhere++; reasons[o.why] = (reasons[o.why] || 0) + 1; }
  }
  const swapped = await open(genome.text.replace('by ' + maker.pub, 'by ' + other.pub));
  const trustedOther = await open(genome.text, { trust: [other.pub] });
  const again = await Promise.all([1, 2, 3].map(async () => (await germinate(genome.text, substrates[0])).organism.id));

  const sealed = Object.fromEntries(sealedRun.library.seeds.map((s) => [s.domain, s.heldAuc]));
  return {
    kind: 'living-seed.organ-1.record', v: 1,
    genome: { text: genome.text, id: genome.id, bytes: utf8(genome.text).length, bodyBytes: utf8(body).length, organs: SEEDS.length, maker: maker.pub },
    reproduce: { sealedIn: 'seed-library ' + sealedRun.sealedIn, sealed, grown: Object.fromEntries(organisms.reference.organs.map((x) => [x.domain, x.heldAuc])) },
    offline: { substrates: substrates.length, networkTouched: touched },
    tamper: { positions: genome.text.length, refused: refusedEverywhere, reasons, makerSwapped: swapped.ok ? 'opened' : swapped.why, untrustedMaker: trustedOther.ok ? 'opened' : trustedOther.why },
    deterministic: { ids: again, same: again.every((x) => x === again[0]) },
    organisms: grown,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure.mjs');
if (isMain) {
  const rec = await measure();
  const text = JSON.stringify(rec, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    writeFileSync(new URL('data/record.json', ROOT), text);
    console.log('wrote data/record.json · ' + sha256Hex(text).slice(0, 16) + ' · ' + stable({ genomeBytes: rec.genome.bytes, refused: rec.tamper.refused + '/' + rec.tamper.positions }));
  }
}
