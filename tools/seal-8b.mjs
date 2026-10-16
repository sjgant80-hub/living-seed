#!/usr/bin/env node
// tools/seal-8b.mjs — organ 8's fair learning test: its pre-registration, committed BEFORE tools/measure-8b.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/mesh.mjs', 'src/gate.mjs', 'src/body.mjs', 'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-8b.mjs', 'tools/judge-8b.mjs', 'tools/seal-8b.mjs', 'tools/judge.mjs',
  'test/mesh.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-8b.prereg', v: 1,
  organ: 'organ 8, the fair learning test — does the mesh learn which route pays when two capable nodes stay alive?',
  why: 'Organ 8’s N7 (routing concentrates) passed for a weak reason: by its last rounds only one full node was alive. Designing a fair test exposed a flaw: routing is greedy (always the best score), and organ 8’s link rule saturates (+0.2 right, −0.1 wrong, held in 0…1), so a better node is never tried and two mostly-right links look alike. This test runs one scenario under three policies: organ 8’s rule; the reliability rule (a link is a running average of being right, rate 0.2); and the reliability rule with exploring (a fifth of routed tasks, seeded, go to another capable node).',
  scenario: 'Five nodes. west holds a third of the shop history (rows i % 3 = 0) and serves normal cases. east holds the third whose advert is highest (rows i % 3 = 1 — chosen after computing each third’s advert, so routing starts at east) but its sensor records time on product pages in minutes, not seconds. a1, a2, a3 hold crop data only and route every shop task. 30 rounds × 9 unseen shop cases, each arriving at an asker.',
  rules: [
    { id: 'L0', kind: 'prediction', claim: 'the premise holds: asked directly on the same tasks, west is right on at least 10 points more of them than east, while east advertises the higher score', seenBeforeSeal: 'the adverts only (east 0.816352, west 0.814989); how each answers the tasks has not been looked at — east may answer wrongly, or abstain because the cases are unlike its data' },
    { id: 'L1', kind: 'prediction', claim: 'under organ 8’s rule, routing locks onto east: in the last 10 rounds at most 10% of routed tasks go to west', seenBeforeSeal: 'no' },
    { id: 'L2', kind: 'prediction', claim: 'the reliability rule alone also locks onto east (at most 10% to west): without exploring, the better node is never tried', seenBeforeSeal: 'no' },
    { id: 'L3', kind: 'prediction', claim: 'with exploring, at least 70% of routed tasks in the last 10 rounds go to west', seenBeforeSeal: 'no' },
    { id: 'L4', kind: 'prediction', claim: 'with exploring, the share of tasks answered right in the last 10 rounds is at least 10 points higher than under organ 8’s rule', seenBeforeSeal: 'no' },
    { id: 'L5', kind: 'property', claim: 'in all three runs every message is admitted by the gate', seenBeforeSeal: 'in kind — unit tests' },
  ],
  disclosure: 'The reliability rule and exploring were added to src/mesh.mjs after organ 8 was measured, as options; organ 8’s rule is still the default, and organ 8’s record reproduces byte for byte. Which policy the full organism uses is decided by this verdict. A failed prediction is kept.',
  judgedBy: 'tools/judge-8b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-8b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-8b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-8b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
