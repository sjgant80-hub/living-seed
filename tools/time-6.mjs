#!/usr/bin/env node
// tools/time-6.mjs — organ 6's wall-time measurement, taken once on the machine that sealed it and committed as
// data/organ-6/timing.json (timing is not reproducible byte for byte, so CI judges the committed file, not a re-run).
// Each condition runs three times, alternating, and the median is kept; the machine and its load are recorded.
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import * as R from '../src/recycle.mjs';
import { evolutions } from './measure-6.mjs';

const ROOT = new URL('../', import.meta.url);
const ms = (f) => { const t = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t) / 1e6; };
const plain = [], pooled = [];
for (let k = 0; k < 3; k++) { plain.push(ms(() => evolutions(null))); pooled.push(ms(() => evolutions(R.assessWith(R.pool())))); }
const med = (xs) => [...xs].sort((a, b) => a - b)[1];
const doc = {
  kind: 'living-seed.organ-6.timing', v: 1,
  what: 'organ 4’s second-design evolution, all five runs, plain and through a fresh recycling pool; three alternating repeats, median kept',
  plainMs: Math.round(med(plain)), pooledMs: Math.round(med(pooled)), speedup: Math.round((med(plain) / med(pooled)) * 100) / 100,
  repeats: { plain: plain.map(Math.round), pooled: pooled.map(Math.round) },
  machine: os.cpus()[0].model.trim() + ' · ' + os.cpus().length + ' threads · ' + Math.round(os.totalmem() / 2 ** 30) + ' GB RAM · load average ' + os.loadavg().map((x) => x.toFixed(1)).join('/') + ' · a local language model was answering in the background',
};
mkdirSync(new URL('data/organ-6/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-6/timing.json', ROOT), JSON.stringify(doc, null, 1) + '\n');
console.log('wrote data/organ-6/timing.json · ×' + doc.speedup);
