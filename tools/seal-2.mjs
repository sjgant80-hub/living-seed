#!/usr/bin/env node
// tools/seal-2.mjs — organ 2's pre-registration: the rules the body will be judged by, the predictions for the
// head-to-head, what was already seen, and the SHA-256 of every file that will ask, measure and judge — written to
// data/organ-2/prereg.json and committed BEFORE a single model is asked (tools/ask-llm.mjs) and before the measurement
// (tools/measure-2.mjs) runs. `node tools/order.mjs --organ 2` later proves the order from git.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs', 'src/body.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/sample.mjs', 'tools/ask-llm.mjs', 'tools/measure-2.mjs', 'tools/judge-2.mjs', 'tools/seal-2.mjs', 'tools/judge.mjs',
  'test/body.test.mjs',
];   // what asks, measures and judges — not the witness runner, which the next organ extends while this one is measured

const prereg = {
  kind: 'living-seed.organ-2.prereg', v: 1,
  organ: 'organ 2 — the body: patterns that route and abstain, an exact-fact cube, an auditable memory, a model slot that only proposes',
  question: 'Does the body answer only where it resembles what it grew on, keep facts exactly, keep a memory that cannot be quietly rewritten — and does a 58-byte organ grown on the device’s own history beat local language models up to 14 billion parameters asked the same unseen shop sessions directly?',
  contest: {
    cases: '300 held-out shop sessions (November–December, never grown on): 100 that ended in a purchase and 200 that did not, drawn with seeds 2026/2027/2028 (tools/sample.mjs)',
    models: 'qwen2.5:14b, qwen2.5:7b, llama3.2:1b through local Ollama — temperature 0, seed 7, context 4096, at most 8 tokens; each model’s digest is recorded',
    conditions: 'zero-shot (what the data is, then the session) and 24-shot (the same plus 24 training sessions with their outcomes, 12 of each)',
    reading: 'the first number in the reply, if it lies in 0–100, as a probability; an unreadable reply is scored as a coin (0.5) and counted',
    scoring: 'AUC on the same 300 cases for every contestant (ties count half); the organ is scored by its rule sum; the organ’s lead over a model is judged with a paired bootstrap (2,000 resamples, seed 99)',
  },
  rules: [
    { id: 'B1', kind: 'property', claim: 'on every unseen case of every domain, each answer the body gives equals what its organ gives and carries a receipt that re-hashes; at least 90% of each domain’s unseen cases resemble their organ enough to be answered, and at least 90% find their own organ unasked', seenBeforeSeal: 'yes — in the plumbing rehearsal, which ran it on the real data: 100% answered and routed home in every domain' },
    { id: 'B2', kind: 'property', claim: 'every one of 2,000 cases drawn outside what the organs grew on abstains, asked and unasked; every unseen case asked of the wrong organ abstains', seenBeforeSeal: 'yes — in the plumbing rehearsal: 2,000/2,000 and 1,200/1,200' },
    { id: 'B3', kind: 'property', claim: 'after 2,000 seeded writes, every fact reads back exactly, by source and latest; no near-miss key (case, a space, an underscore) answers; every one of 200 single-fact edits is found where it was made', seenBeforeSeal: 'yes — in the plumbing rehearsal: all exact, 0 near-miss answers, 200/200 edits found' },
    { id: 'B4', kind: 'property', claim: 'over 150 episodes the memory chain holds, every edit a forger re-hashes is found at the entry after it, and at least 95% of episodes are recalled first by their own words', seenBeforeSeal: 'yes — written as a prediction, then seen in the plumbing rehearsal (150/150 recalled first, 149/149 forgeries found), so it is claimed as a property, not a prediction' },
    { id: 'B5', kind: 'prediction', claim: 'on the 300 unseen shop sessions the organ’s AUC is higher than every model’s in both conditions — six comparisons, all six won', seenBeforeSeal: 'no — no model has been asked a held-out case; a plumbing dry run on TRAINING rows (with made-up model answers) showed the organ near 0.84 AUC on a training sample' },
    { id: 'B6', kind: 'prediction', claim: 'against qwen2.5:14b in its better condition, the organ leads by at least 0.05 AUC, and the paired-bootstrap 95% lower bound of its lead is above 0', seenBeforeSeal: 'no' },
    { id: 'B7', kind: 'prediction', claim: 'on this machine the organ answers at least 10,000 times faster than qwen2.5:14b at its fastest median, from at least 10 million times fewer bytes (its seed against the model’s weights)', seenBeforeSeal: 'no' },
  ],
  disclosure: 'The body was built and unit-tested before this seal; B1–B4 are properties it claims. The whole pipeline — seal, answers, measurement, judge, order — was rehearsed in a throwaway clone with the head-to-head sample moved onto TRAINING rows and made-up model answers, to prove every step runs before anything is pinned. B1–B4 do not use that sample, so the rehearsal ran them on the real data and their results were seen (all held); B4 was a prediction until then and is now claimed as a property. For the head-to-head, the rehearsal showed the organ near 0.84 AUC on a training sample, and nothing about any held-out case or any real model answer: B5–B7 are unseen. Before this seal the estate held no receipt for the claim “a 79-byte rule beats a 14B model”: the 79 bytes are konomi-slm’s demo brain (held-out AUC 0.870 on 4,931 rows); no record pitted an organ against a 14B answering directly. This is that measurement, made fresh. A failed prediction is kept.',
  judgedBy: 'tools/judge-2.mjs (pinned below): a rule it does not know is a FAIL',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return; check it out again (git stores it LF) and re-seal'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-2/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-2/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-2/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
