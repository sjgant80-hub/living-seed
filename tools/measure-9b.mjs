#!/usr/bin/env node
// tools/measure-9b.mjs — organ 9's behaviour watch, second attempt. Organ 9's watch kept one mix of everything a peer
// sent, and honest rounds' mixes swung as far as 0.8 on a handful of tasks, so its limit reached 1 and it could cut no
// one: the takeover went uncaught. This attempt keeps Gary W. Floyd's domains apart — what a peer CLAIMS, how it otherwise
// CONDUCTS itself, how much it sends — each against its own baseline, each with its own limit from honest rounds alone.
// Everything else is organ 9's, unchanged: the same six organisms, the same three attacks, the same draws, the same
// margin, run by organ 9's own trial (tools/measure-9.mjs). Organ 8's and organ 9's runs are not repeated: their numbers
// are read from data/organ-9/record.json, whose hash this record carries (CI re-derives that record on every push).
// Deterministic: node tools/measure-9b.mjs [--check] → data/organ-9b/record.json. Sealed first (tools/seal-9b.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as I from '../src/immune.mjs';
import { trial, DRAW, CALIBRATION_DRAW, CAP, THEFT_AT, TAKEOVER_AT } from './measure-9.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const OPEN = { claims: 1, conduct: 1, volume: Number.MAX_VALUE };   // a watch that cuts nobody: for calibrating

export async function measure() {
  const nine = read('data/organ-9/record.json'), r9 = JSON.parse(nine);
  const calib = await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, channels: true, limits: OPEN } }, false, CALIBRATION_DRAW);
  const limits = I.channelLimitsFrom(calib.closes);
  const top = (k) => Math.max(0, ...calib.closes.map((c) => c[k]).filter((x) => typeof x === 'number'));
  const strip = (t) => { const { closes, ...rest } = t; return rest; };
  const under = strip(await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, channels: true, limits } }, true, DRAW));
  const quiet = strip(await trial({ learn: 'evidence', immune: { cap: CAP, law: I.LAW, channels: true, limits } }, false, DRAW));
  const pick = (t) => ({ tasks: t.tasks, flood: { checked: t.flood.checked, admitted: t.flood.admitted }, thief: { blackHoled: t.thief.blackHoled }, takeover: t.takeover });
  return {
    kind: 'living-seed.organ-9b.record', v: 1, draw: DRAW, theftAt: THEFT_AT, takeoverAt: TAKEOVER_AT, cap: CAP,
    calibration: { draw: CALIBRATION_DRAW, limits, top: { claims: top('claims'), conduct: top('conduct'), volume: top('volume') } },
    reference: { record: 'data/organ-9/record.json', sha256: sha256Hex(nine).slice(0, 16), organ8: pick(r9.organ8), organ9: pick(r9.organ9) },
    organ9b: under, quiet,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-9b.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-9b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-9b/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-9b/record.json', ROOT), text);
    console.log('wrote data/organ-9b/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
