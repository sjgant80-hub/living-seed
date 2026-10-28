#!/usr/bin/env node
// tools/seal-13b.mjs — organ 13b's pre-registration, committed BEFORE tools/measure-13b.mjs runs. It pins every file the
// measurement and its judge load (followed through every import) and the data they read.
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
  ...loaded(['tools/measure-13b.mjs', 'tools/judge-13b.mjs', 'tools/seal-13b.mjs']),
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-13/record.json', 'data/organ-13/tab.json', 'data/organ-13/verdict.json',
])].sort();

const prereg = {
  kind: 'living-seed.organ-13b.prereg', v: 1,
  organ: 'organ 13b — organ 13 at its exact scope: every bit at both doors, the files the system loads read as code, and a fingerprint made to travel to a browser tab',
  design: 'Three of organ 13’s threads, each closed at the scope its words claim. Organ 13 changed the lowest bit of every byte of an ask and its answer; here every bit of every byte is changed, at the organ’s door and at the keeper’s. Organ 13’s scan of the files the system loads named four fragments of text as modules; here only import and export statements are read, with comments skipped. Organ 13’s fingerprint failed to travel to a tab (S7, kept) because three domains are drawn with Math.log and Math.cos, which two engines may round differently in the last digit, and each receipt names its case exactly. Here the fingerprint is taken in two parts: the receipts of the first 100 held-out shop sessions (real data, read from a file, the same bits in every engine), and, for the first 25 held-out cases of each synthetic domain, what each answer says — its label, score, threshold and the rules that fired.',
  rules: [
    { id: 'B1', kind: 'prediction', claim: 'every one-bit change — all eight bits of every byte — to an ask is refused at the organ’s door, and every one to its answer at the keeper’s door; afterwards the genuine answer is verified and credited once', seenBeforeSeal: 'in kind — organ 13 changed the lowest bit of every byte of these two messages (445 + 354 changes) and every one was refused' },
    { id: 'B2', kind: 'property', claim: 'read as code — import and export statements only, comments skipped — the files the system loads are exactly the ones organ 13 followed, all inside the repository: no module from outside it, and no dynamic import', seenBeforeSeal: 'yes — organ 13 followed the same files; its list of outside names held only four fragments of text' },
    { id: 'B3', kind: 'prediction', claim: 'a fingerprint made to travel: in a browser tab, the same genome, data and phrase grow the same organism and roster; the receipts of the first 100 held-out shop sessions are byte for byte the record’s; on the first 25 held-out cases of each synthetic domain every answer says the same as the record’s — label, score, threshold and the rules that fired; every answer verified; one digest, equal to this record’s, in under 10 seconds', seenBeforeSeal: 'partly — in organ 13’s tab the first 25 shop sessions matched Node’s exactly and 9 of the 75 synthetic cases differed in their last digits; what those answers said was not compared, and shop sessions 26–100 were not looked at' },
  ],
  disclosure: 'Built before this seal: tools/organ-13b.mjs (the travelling fingerprint, shared with the page) and these tools. The measurement was run once in smoke mode (3 changes per door) to check that it runs end to end; its numbers were not read. Whether Node 22 on GitHub’s runner draws the synthetic domains to the same last digits as Node 25, where this record is made, is not known before CI runs; this record is built to hold nothing that depends on those digits, so it should reproduce either way. Scope as organ 13: one process, signed messages in memory, a public phrase, three synthetic domains and the real shop. A failed prediction is kept.',
  judgedBy: 'tools/judge-13b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-13b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-13b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-13b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
