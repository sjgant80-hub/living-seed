#!/usr/bin/env node
// tools/seal-9b.mjs — organ 9's behaviour watch, second attempt: its pre-registration, committed BEFORE measure-9b runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/immune.mjs', 'src/mesh.mjs', 'src/gate.mjs', 'src/body.mjs', 'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-9/record.json',
  'tools/measure-9b.mjs', 'tools/measure-9.mjs', 'tools/measure-8.mjs', 'tools/judge-9b.mjs', 'tools/seal-9b.mjs', 'tools/judge.mjs',
  'test/immune.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-9b.prereg', v: 1,
  organ: 'organ 9, the behaviour watch, second attempt — kept by channel, does it catch the takeover without cutting an honest node?',
  why: 'Organ 9’s watch kept one mix of everything a peer sent. Honest rounds’ mixes swung as far as 0.8 on a handful of tasks, so the limit taken from them reached its ceiling of 1 and the watch could cut no one: south’s takeover went uncaught (I9, I10 failed; I3’s pass was hollow). Gary W. Floyd’s signatures are kept per domain of behaviour (Lumiea Systems Research Division — ThunderStruck Service LLC — “GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps,” 2025); this attempt does the same: what a peer claims (its adverts), how it otherwise conducts itself, and how much it sends, each against its own baseline, each with its own limit from honest rounds alone (src/immune.mjs channels, opts.immune.channels in the mesh). It is an option: organ 9 reproduces as it was.',
  scenario: 'Organ 9’s, unchanged and run by organ 9’s own trial: the same six organisms, the same three attacks, draw 97, calibration on draw 41 with no attacker, limits = the largest honest value × 1.25 (claims and conduct at most 1, volume at least 1). Organ 8’s and organ 9’s numbers are read from data/organ-9/record.json (pinned below).',
  rules: [
    { id: 'J1', kind: 'prediction', claim: 'kept apart, the claims channel can tell rounds apart: its limit from honest rounds is under 1', seenBeforeSeal: 'no — organ 9 saw only the single mix (0.8)' },
    { id: 'J2', kind: 'prediction', claim: 'every honest node has cut the taken-over south off by the end of the round after the takeover', seenBeforeSeal: 'in kind — toy-mesh unit tests' },
    { id: 'J3', kind: 'prediction', claim: 'organ 9b sends the taken-over south at most half as many cases as organ 8 did (37) from the takeover on', seenBeforeSeal: 'no' },
    { id: 'J4', kind: 'prediction', claim: 'no honest peer is cut off by behaviour, under attack or with no attacker', seenBeforeSeal: 'no' },
    { id: 'J5', kind: 'property', claim: 'organ 9’s other guarantees hold with the new watch: no forgery admitted, no honest key revoked by a proof, no honest link refused by an honest node still trusting it, memory within its cap', seenBeforeSeal: 'in kind — organ 9' },
    { id: 'J6', kind: 'prediction', claim: 'the new watch does not weaken the rest: farm’s stolen key is still revoked by every honest node in the round it was stolen, and the flood’s signature checks stay at most a tenth of organ 8’s', seenBeforeSeal: 'in kind — organ 9' },
    { id: 'J7', kind: 'prediction', claim: 'cutting the takeover costs at most 10 right answers against organ 9 (234 right)', seenBeforeSeal: 'no' },
  ],
  disclosure: 'This attempt was designed after organ 9’s verdict, knowing its numbers: that the takeover advertises 0.97, that honest single-mix rounds reached 0.8, and that revoking farm cost its own 8 requests. The attacks, draws and margin were not changed. Organ 9’s verdict stands as it was. A failed prediction is kept.',
  judgedBy: 'tools/judge-9b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-9b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-9b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-9b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
