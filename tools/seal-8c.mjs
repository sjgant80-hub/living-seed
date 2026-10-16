#!/usr/bin/env node
// tools/seal-8c.mjs — organ 8's fair learning test, third attempt: its pre-registration, committed BEFORE measure-8c runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/mesh.mjs', 'src/gate.mjs', 'src/body.mjs', 'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-8c.mjs', 'tools/judge-8c.mjs', 'tools/seal-8c.mjs', 'tools/judge.mjs',
  'test/mesh.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-8c.prereg', v: 1,
  organ: 'organ 8, the fair learning test, third attempt — does the mesh find out a node that over-claims?',
  why: 'Organ 8b’s premise failed: a unit fault did not make its node worse (the organ’s key thresholds are at zero, which have no units), so there was nothing to learn. This attempt uses the failure the trust rail exists for: a node that over-claims. Its premise was checked before this seal on TRAINING rows that are never tasks here — the weak recipe on east’s third was right on 55.4% of them, the origin recipe on west’s third on 73.0% — and the recipe was picked by a seeded search for one that barely clears the gate. Designing this test also changed the mesh: an additive advert-plus-link score lets an inflated claim outweigh any evidence, so the evidence rule (src/mesh.mjs, opts.learn \'evidence\') counts an advert as 4 cases and then lets what a route actually did decide. It is an option; organ 8’s rule stays the default and organs 8 and 8b reproduce.',
  scenario: 'Five nodes. west: the origin crop recipe on crop rows i % 3 = 0, advertising its real unseen-case AUC. east: a weak crop recipe on rows i % 3 = 1 (it clears the 0.6 gate) advertising 0.90. a1, a2, a3: shop data only; they route every crop task. 30 rounds × 9 unseen crop cases. Four policies on the same scenario: organ 8’s rule; reliability; reliability + exploring (0.2, seed 5); evidence (no exploring).',
  rules: [
    { id: 'E0', kind: 'prediction', claim: 'the premise holds on the tasks themselves: asked directly, west is right on at least 10 points more of them than east, while east advertises more', seenBeforeSeal: 'on training rows only (55.4% vs 73.0%); the tasks are held-out rows and have not been looked at' },
    { id: 'E1', kind: 'prediction', claim: 'organ 8’s rule never finds the over-claimer out: at most 10% of late routed tasks go to west', seenBeforeSeal: 'no' },
    { id: 'E2', kind: 'prediction', claim: 'the evidence rule finds it out without any exploring: at least 80% of late routed tasks go to west', seenBeforeSeal: 'in kind — a unit test on a toy mesh where the over-claimer was made wrong on every case' },
    { id: 'E3', kind: 'prediction', claim: 'with the evidence rule, the share of tasks answered right in the last 10 rounds is at least 10 points above organ 8’s rule', seenBeforeSeal: 'no' },
    { id: 'E4', kind: 'prediction', claim: 'reliability + exploring finds it out partly: at least 50% of late routed tasks go to west', seenBeforeSeal: 'no' },
    { id: 'E5', kind: 'property', claim: 'in all four runs every message is admitted by the gate', seenBeforeSeal: 'in kind — unit tests' },
  ],
  disclosure: 'This is the third attempt at this question, and the earlier two are kept as they are (organ 8’s N7 was a weak test; 8b’s premise failed). The policy the full organism uses is decided by this verdict. A failed prediction is kept.',
  judgedBy: 'tools/judge-8c.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-8c/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-8c/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-8c/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
