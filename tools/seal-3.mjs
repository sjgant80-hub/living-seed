#!/usr/bin/env node
// tools/seal-3.mjs — organ 3's pre-registration: the rules the gate will be judged by and the SHA-256 of every file that
// will attack, measure and judge it — data/organ-3/prereg.json, committed BEFORE tools/measure-3.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs', 'src/gate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-3.mjs', 'tools/judge-3.mjs', 'tools/seal-3.mjs', 'tools/judge.mjs',
  'test/gate.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-3.prereg', v: 1,
  organ: 'organ 3 — the gate: on what enters (messages), on what is learned from outside (lessons), on what replicates (child genomes)',
  question: 'Does anything unproven get in, get learned, or get passed on — under replay, reordering, redirection, forged and swapped keys, every one-character change, thousands of random damages, validly signed but non-canonical text, and every forbidden kind of child?',
  rules: [
    { id: 'G1', kind: 'property', claim: 'three trusted peers each send 20 messages: all 60 admitted in order; across at least ten attack families (replay, skipping ahead, redirection to another organism, a forbidden kind, an untrusted key, a swapped key, every one-character change, 4,000 random damages, validly signed non-canonical text, oversize) not one attack is admitted; junk of every type is refused without a throw; and the next legitimate message still gets in', seenBeforeSeal: 'in kind — the unit tests run smaller versions of each family; this battery has not been run' },
    { id: 'G2', kind: 'prediction', claim: 'of 30 lessons (five recipes — the four origin seeds and konomi-slm’s council-grown shop seed — weighed for two organisms on three devices), exactly four are adopted: the two shop recipes, into the organism that lacks a shop organ, on the two devices whose shop data carries signal. Nothing is adopted into the origin organism: no lesson beats an organ it already grows', seenBeforeSeal: 'partly — unit tests saw the council seed fail to beat the origin’s shop organ on the reference device, the origin shop seed adopted by the lacking organism there, and refused on shuffled data; the no-water device and the council seed into the lacking organism have not been looked at' },
    { id: 'G3', kind: 'property', claim: 'three generations replicate from the origin — each child opens, names its parent, raises the bar (0.61, 0.62, 0.63), keeps all four organs live and carries its parent’s recipes unchanged; all eight forbidden children (a cut organ, a dormant organ, a lower bar, a missing organ, a one-byte-changed parent, an organism from another genome, an untrusted parent maker, a maker not allowed) are refused; and a noisy device can still pass on the organs it did prove', seenBeforeSeal: 'in kind — the unit tests cover each refusal once; the three-generation chain has not been run' },
    { id: 'G4', kind: 'property', claim: 'every refused input the battery remembers is known again on sight by its fingerprint', seenBeforeSeal: 'in kind — unit test on two inputs' },
  ],
  disclosure: 'The gate was built and unit-tested before this seal. G1, G3 and G4 are properties it claims; G2 is a prediction because it names exactly which lessons should get in, and two of its cells have not been looked at. An outside adversary is not this organ: it is the last of the three receipts.',
  judgedBy: 'tools/judge-3.mjs (pinned below): a rule it does not know is a FAIL',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return; check it out again (git stores it LF) and re-seal'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-3/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-3/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-3/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' prediction) · ' + FILES.length + ' files pinned');
