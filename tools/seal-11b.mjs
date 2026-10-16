#!/usr/bin/env node
// tools/seal-11b.mjs — the organism's memory, its guarantee stated exactly: pre-registration, committed BEFORE measure-11b runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/organism.mjs', 'src/align.mjs', 'src/card.mjs', 'src/body.mjs', 'src/germinate.mjs', 'src/genome.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/record.json',
  'tools/measure-11b.mjs', 'tools/measure-11.mjs', 'tools/measure-10.mjs', 'tools/judge-11b.mjs', 'tools/seal-11b.mjs', 'tools/judge.mjs',
  'test/organism.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-11b.prereg', v: 1,
  organ: 'organ 11, the memory’s guarantee stated exactly — what changes to the data under a memory stop it waking?',
  why: 'Organ 11’s K2 claimed a memory would not wake on “different data under it”. It woke when the dataset’s label for a lived case was changed: the memory carries the truth the device was told, and the life reads that. The guarantee the design gives is this: waking re-derives every act from the genome, the data and the remembered cases, so any change that alters an act — an organ, a claim, an answer — stops it waking; a change that alters no act is, by construction, not a change to what it lived. Whether a real change alters an act is not certain — the ribosome sets thresholds from the measurements, not the labels — so those rules are predictions.',
  scenario: 'Device A of organ 11 (the even real shop sessions): the origin genome grown on February–May, its claim on June–July, living August–October audited at organ 10b’s scales, remembered and signed. Then, one at a time, on 12 evenly spaced rows of each kind: a label flipped in the rows its organs grew from; a label flipped in the rows it measured its claim on; a lived case’s page value changed (×10 + 100); the dataset’s label flipped for a lived case.',
  rules: [
    { id: 'L1', kind: 'property', claim: 'on unchanged data, the memory wakes', seenBeforeSeal: 'yes — organ 11' },
    { id: 'L2', kind: 'prediction', claim: 'a label flipped in any of the 12 training rows stops it waking', seenBeforeSeal: 'in kind — the unit test flipped one training row of a toy world and it was refused' },
    { id: 'L3', kind: 'prediction', claim: 'a label flipped in any of the 12 rows it measured its claim on stops it waking (its claim changes)', seenBeforeSeal: 'no' },
    { id: 'L4', kind: 'prediction', claim: 'a large change to any of the 12 lived cases’ page value stops it waking (its answer’s receipt changes)', seenBeforeSeal: 'no' },
    { id: 'L5', kind: 'property', claim: 'flipping the dataset’s label for any of the 12 lived cases does not stop it waking — the memory carries what the device was told, and the life reads that', seenBeforeSeal: 'yes — organ 11’s K2 did this once, and it woke' },
  ],
  disclosure: 'Designed after organ 11’s verdict, which stays as sealed (RED on K2). A failed prediction is kept.',
  judgedBy: 'tools/judge-11b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-11b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-11b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-11b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
