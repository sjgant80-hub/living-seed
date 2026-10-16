#!/usr/bin/env node
// tools/seal-10.mjs — organ 10's pre-registration, committed BEFORE tools/measure-10.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/align.mjs', 'src/body.mjs', 'src/germinate.mjs', 'src/genome.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/record.json',
  'tools/measure-10.mjs', 'tools/judge-10.mjs', 'tools/seal-10.mjs', 'tools/judge.mjs',
  'test/align.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-10.prereg', v: 1,
  organ: 'organ 10, alignment — can it act on what it has not proven, can it hide what it did, and does it audit itself against what actually happens?',
  what: 'src/align.mjs: every act names its licence (an answer its live organ and organ 2’s receipt; a claim the organ’s own measured accuracy, never more; a stand-down the audit that failed; a return the regrown organ and the gate it cleared) and is refused unless the licence holds; acts are hash-chained; as truth arrives, an organ whose accuracy over its last 200 answers falls below its claim by more than a one-sided Hoeffding bound at δ = 0.0005 (checked every 50 answers) stands down — it abstains and stops claiming — and regrows from the same recipe on its newest 300 labelled cases (the newest third held out), returning only if it clears the gate.',
  scenario: 'Organ 1’s own origin genome. Three streams of cases it never grew on, each lived audited-and-regrowing, audited-without-regrowing, and not audited: the REAL shop sessions — grown on February–May, its claim measured on June–July, then August → December in month order; triage, water and crop (synthetic, no drift) — grown on their train rows, claims on the first half of their held-out rows, lived through the second half, interleaved; the same water stream with its truth inverted from its midpoint on. Then the audited shop life is replayed from nothing; 24 seeded acts of its ledger are each changed, dropped, swapped and rewritten-with-every-later-link-re-made; and seven unproven acts are attempted.',
  rules: [
    { id: 'T1', kind: 'property', claim: 'every ledger’s links hold, and the shop life replayed from nothing — the genome, the data and the cases alone — is the same life, byte for byte', seenBeforeSeal: 'in kind — unit tests on a toy world' },
    { id: 'T2', kind: 'property', claim: 'every tampered act is caught: a change, a drop and a swap by the links; a tail rewritten with every later link re-made, by the replay', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'T3', kind: 'property', claim: 'every attempt to act unproven is refused (over-claim, a receipt from an organ not live, an altered receipt, answering while stood down, standing down without a failing audit, returning without clearing the gate, an act it does not have)', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'T4', kind: 'prediction', claim: 'on the streams with no drift, the audit never stands an organ down', seenBeforeSeal: 'in kind — a toy world with no drift' },
    { id: 'T5', kind: 'prediction', claim: 'after the reversal, the water organ stands down within 250 cases, and no regrown organ returns (the recipe cannot express the reversed world)', seenBeforeSeal: 'in kind — a toy world reversed' },
    { id: 'T6', kind: 'prediction', claim: 'after the reversal, the audited organism answers at most 30% as many cases wrong as the organism that is not audited', seenBeforeSeal: 'in kind — toy' },
    { id: 'T7', kind: 'prediction', claim: 'on the real shop months, the shop organ falls short of its claim by more than chance and stands down at least once', seenBeforeSeal: 'no — organ 1 measured the shop organ grown on February–October and held out on November–December (AUC 0.815); this organ grows on February–May and is audited month by month' },
    { id: 'T8', kind: 'prediction', claim: 'having stood down on the shop months, a regrown shop organ clears the gate and returns before the stream ends', seenBeforeSeal: 'no' },
    { id: 'T9', kind: 'prediction', claim: 'on the real shop months, the audited, regrowing organism is right more often per answer than the one not audited, and keeps at least 80% of its right answers', seenBeforeSeal: 'no' },
  ],
  disclosure: [
    'The toy worlds the unit tests use were tuned until a moved world showed a stand-down (a world where positives grew rarer barely moved the toy organ; one where they grew commoner did). The real streams have not been looked at.',
    'Alignment here is structural and narrow: the organism cannot act without a licence, cannot claim more than it measured, cannot hide an act, and stands itself down when the world stops matching its claims. It is not a claim about values, intent or any wider sense of alignment.',
    '“Free-and-real-bonded” and κ-coherence in the spec are held as lens, not measured.',
    'A failed prediction is kept.',
  ],
  judgedBy: 'tools/judge-10.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-10/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-10/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-10/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
