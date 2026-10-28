#!/usr/bin/env node
// tools/seal-14.mjs — organ 14's pre-registration, committed BEFORE tools/measure-14.mjs scores anything.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
function loaded(entries) {
  const seen = new Set();
  const walk = (url) => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const m of readFileSync(url, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)) walk(new URL(m[1], url));
  };
  for (const e of entries) walk(new URL(e, ROOT));
  return [...seen].map((h) => h.slice(ROOT.href.length));
}
const FILES = [...new Set([
  ...loaded(['tools/measure-14.mjs', 'tools/judge-14.mjs', 'tools/seal-14.mjs', 'test/substrate.test.mjs']),
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/record.json',
])].sort();

const prereg = {
  kind: 'living-seed.organ-14.prereg', v: 1,
  organ: 'organ 14 — the compute layer is swappable: the organism is structure, not weights locked to one engine, so the same organ, scored by four different substrates, gives the same answer (within what each substrate can represent)',
  design: 'Organ 1’s origin genome is grown on the reference device. Each of its live organs is scored on every held-out case by four substrates (src/substrate.mjs): JavaScript doubles (the reference, exactly germinate.mjs’s answer), exact integers in millionths, a WebAssembly module assembled by hand here (no build tool), and single precision (a stand-in for a GPU or an analog part). The answer is the organ’s structure applied to the case; only the arithmetic engine changes.',
  rules: [
    { id: 'V1', kind: 'property', claim: 'the doubles substrate is exactly the organism’s own answer: on every held-out case of every live organ, its score and label equal what germinate.mjs gives', seenBeforeSeal: 'yes — a unit test checks f64 equals germinate on toy organs' },
    { id: 'V2', kind: 'property', claim: 'two more engines agree byte for byte: exact integers in millionths and a hand-assembled WebAssembly module (a valid, self-contained module) give the organism’s own score and label on every one of those cases — the same structure, three different engines', seenBeforeSeal: 'in kind — a unit test on toy organs' },
    { id: 'V3', kind: 'prediction', claim: 'single precision agrees too, bar a counted few: it gives the reference label on all but at most 1% of the cases, and every disagreement sits within one single-precision step of the line, where single precision cannot tell the score from the threshold', seenBeforeSeal: 'no — never run on the real organs; the smoke run read a few cases per organ, its numbers not kept' },
  ],
  disclosure: 'Before this seal src/substrate.mjs was built, unit-tested (7 tests) and mutation-gated (30 of 30 mutants killed), and the WebAssembly module validated. The measurement was smoke-run on a few cases per organ to check it runs; its numbers were not read. Three of the four domains are seed-library’s synthetic data; the shop is real (UCI). A single-precision substrate stands in for a GPU or a future analog part — it is the same structure at lower numeric precision, not a different model. A failed prediction is kept.',
  judgedBy: 'tools/judge-14.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-14/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-14/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-14/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
