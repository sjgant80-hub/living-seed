#!/usr/bin/env node
// tools/seal.mjs — organ 1's pre-registration: the rules it will be judged by, the predictions, what was already seen,
// and the SHA-256 of every file that will make the measurement — written to data/prereg.json and committed BEFORE
// tools/measure.mjs is run. tools/judge.mjs --history later proves from git that the seal came first and that the record
// was made by exactly the code pinned here.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure.mjs', 'tools/judge.mjs', 'tools/seal.mjs',
  'test/genome.test.mjs', 'test/germinate.test.mjs', 'test/gates.test.mjs',
  'witness-all.mjs', '.witness/witness.mjs',
];

const prereg = {
  kind: 'living-seed.organ-1.prereg', v: 1,
  organ: 'organ 1 — the genome and germination (Γ)',
  question: 'Does one sealed genome of a few hundred bytes grow, on each device’s own data and offline, an organism that answers only where it has earned it — and refuse to grow at all when a single byte is changed?',
  substrates: {
    reference: 'all four domains as seed-library sealed them',
    'device-a': 'the same four domains, holding only the even half of each train history',
    'device-b': 'the odd half',
    'shuffled-shopper': 'shopper labels shuffled (seed 9) so there is nothing left to learn; the other domains as the reference',
    'no-water': 'no water data at all',
  },
  rules: [
    { id: 'R1', kind: 'property', claim: 'the whole four-organ genome, sealed, is at most 512 bytes', seenBeforeSeal: 'yes — 496 bytes in a smoke run and a unit test' },
    { id: 'R2', kind: 'property', claim: 'all five germinations, the seal check included, make no network call', seenBeforeSeal: 'yes — for the reference germination, in a unit test' },
    { id: 'R3', kind: 'property', claim: 'on the reference data every organ reproduces seed-library’s sealed held-out AUC exactly, and answers every held case at exactly the accuracy the ribosome grades', seenBeforeSeal: 'yes — in a smoke run and the unit tests' },
    { id: 'R4', kind: 'property', claim: 'every one-character change to the genome is refused; the maker’s key swapped is refused on the signature; another maker’s trust list refuses it', seenBeforeSeal: 'yes — the unit tests run the same sweep' },
    { id: 'R5', kind: 'property', claim: 'the rules it grows are at least twice the bytes the genome carries: the device’s data supplies the rest', seenBeforeSeal: 'yes — ×2.41 in a smoke run' },
    { id: 'R6', kind: 'prediction', claim: 'on device-a and device-b, each holding half the history, all four organs still clear the gate, each within 0.03 AUC of the reference, and the three organisms all differ', seenBeforeSeal: 'partly — a unit test saw the two ids differ and at least one organ’s rules differ; no device-shard state or AUC has been looked at' },
    { id: 'R7', kind: 'property', claim: 'germination is deterministic: three more runs grow the reference organism’s id, and CI re-derives the record byte for byte', seenBeforeSeal: 'yes — in a unit test, locally' },
    { id: 'R8', kind: 'prediction', claim: 'with the shopper labels shuffled the shopper organ scores a coin (held-out AUC from 0.45 to 0.55), is cut, and abstains on every shopper case, while the other three organs answer every case', seenBeforeSeal: 'partly — a unit test saw it cut with AUC under 0.6; the AUC itself and the other organs’ calls have not been looked at' },
    { id: 'R9', kind: 'property', claim: 'with no water data the water organ is dormant and abstains on every water case; the other three are live and answer every case', seenBeforeSeal: 'yes — in a unit test' },
  ],
  disclosure: 'This organ was built and unit-tested before this seal, so most rules were seen first and are properties the build claims, not predictions. Only R6 (half the history is enough, within 0.03) and R8 (no signal reads as a coin, and cutting one organ leaves the rest whole) are unseen in the part that matters. A failed prediction is kept in the verdict, not re-run until it passes.',
  judgedBy: 'tools/judge.mjs (pinned below): a rule it does not know is a FAIL',
  files: Object.fromEntries(FILES.map((p) => [p, fileHash(readFileSync(new URL(p, ROOT)))])),
};

writeFileSync(new URL('data/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
