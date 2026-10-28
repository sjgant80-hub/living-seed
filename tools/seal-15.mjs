#!/usr/bin/env node
// tools/seal-15.mjs — organ 15's pre-registration, committed BEFORE tools/measure-15.mjs runs the naive lineage.
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
const NIGHTS = Array.from({ length: 10 }, (_, i) => 'data/nights/' + (i + 1) + '/record.json');
const FILES = [...new Set([...loaded(['tools/measure-15.mjs', 'tools/judge-15.mjs', 'tools/seal-15.mjs']), 'data/online_shoppers_intention.csv', ...NIGHTS])].sort();

const prereg = {
  kind: 'living-seed.organ-15.prereg', v: 1,
  organ: 'organ 15 — the self-similar stack, one gap: does nature’s answer to instability (homeostasis — a dead band, and change only when the signal persists) beat the naive answer (adopt any gain) when the organism improves itself?',
  design: 'Two adoption rules over the same ten nights, the same seeds and the same real shop data. Naive: organ 11’s rule — a child is adopted if it beats the organ on October alone by the fixed margin (z = 0). Homeostatic: the nights’ rule — the gain must exceed twice its own noise (z = 2) and, from night 2, hold on August, September and October each on its own. Each lineage starts from organ 1’s origin and moves only to a child its own rule adopted; after every night both are scored on November–December, which never steers a choice. The homeostatic lineage is the ten committed nights (data/nights/1–10, each sealed before it ran), read here; the naive lineage is run here.',
  rules: [
    { id: 'H1', kind: 'property', claim: 'the homeostatic lineage is exactly the ten committed nights, each starting from the champion the night before left; the naive lineage runs the same ten nights on the same seeds', seenBeforeSeal: 'yes — the nights are committed' },
    { id: 'H2', kind: 'prediction', claim: 'the naive rule adopts more often than the homeostatic rule over the ten nights', seenBeforeSeal: 'half — the homeostatic count is known (the committed nights); the naive count has never been run' },
    { id: 'H3', kind: 'prediction', claim: 'after the ten nights the homeostatic lineage scores at least as well on November–December as the naive lineage', seenBeforeSeal: 'half — the homeostatic score is known; the naive score has never been run' },
    { id: 'H4', kind: 'prediction', claim: 'the naive rule makes more harmful adoptions — adoptions after which November–December fell — than the homeostatic rule', seenBeforeSeal: 'half — the homeostatic adoptions are known; the naive ones have never been run' },
  ],
  disclosure: 'Known before this seal, and said so: the homeostatic lineage is the committed nights, so its numbers are already on the record — November–December went from 0.819 at the origin to 0.777 after ten nights, through one adoption. That is, nature’s rule has already been seen to fail to improve the organism here; this organ asks only whether the naive rule does worse. The naive lineage was smoke-run on two tiny nights to check the plumbing; its numbers were not read. One real dataset (the shop, UCI), one gap (stability). Predictions that fail are kept.',
  judgedBy: 'tools/judge-15.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-15/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-15/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-15/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
