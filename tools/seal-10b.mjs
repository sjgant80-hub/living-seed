#!/usr/bin/env node
// tools/seal-10b.mjs — organ 10's self-audit, second attempt: its pre-registration, committed BEFORE measure-10b runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/align.mjs', 'src/body.mjs', 'src/germinate.mjs', 'src/genome.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/record.json',
  'tools/measure-10b.mjs', 'tools/measure-10.mjs', 'tools/judge-10b.mjs', 'tools/seal-10b.mjs', 'tools/judge.mjs',
  'test/align.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-10b.prereg', v: 1,
  organ: 'organ 10, the self-audit, second attempt — do its claims follow what actually happens, and is a collapse caught fast?',
  why: 'Organ 10’s audit kept one 200-answer window. It caught the reversal 69 cases late (57 wrong, against a predicted ≤ 30% of 140), and it could not see the real shop organ delivering 76.5–79.4% from August to November against its claim of 82.9% — a 200-answer Hoeffding bound only notices a drop of about 14 points — so the organism went on claiming 82.9%. That is over-claiming, the thing alignment here exists to stop. This attempt audits at three scales sharing the same δ (src/align.mjs CHECKS): a 50-answer window, checked every 10 answers, that stands a collapse down; and 400- and 1,600-answer windows that, when an organ delivers less than it claims by more than chance, lower its claim to what it delivered — a licensed act citing that audit — while it keeps answering. A claim may be lowered by an audit; it is never raised past what was measured.',
  scenario: 'Organ 10’s, unchanged and run by organ 10’s own code: the origin genome; the REAL shop sessions (grown February–May, claim on June–July, lived August → December); triage, water and crop with no drift; the water stream reversed at its midpoint (case 180). The shop and reversal streams are also lived not audited, and the reversal by organ 10’s single window, for comparison.',
  rules: [
    { id: 'W1', kind: 'property', claim: 'every ledger’s links hold, and the audited shop life replayed from nothing is the same life', seenBeforeSeal: 'in kind — organ 10' },
    { id: 'W2', kind: 'property', claim: 'it cannot lower a claim citing an audit that shows no shortfall, nor raise a claim past what it measured', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'W3', kind: 'prediction', claim: 'on the streams with no drift, nothing stands down and no claim is lowered — three scales of checks raise no false alarm', seenBeforeSeal: 'no — organ 10 checked one scale' },
    { id: 'W4', kind: 'prediction', claim: 'after the reversal, the 50-answer window stands the water organ down within 60 cases', seenBeforeSeal: 'in kind — organ 10’s numbers (its claim 0.778; accuracy after the reversal about a fifth) put it near 30–40 cases' },
    { id: 'W5', kind: 'prediction', claim: 'after the reversal, it answers at most 30% as many cases wrong as the organism that is not audited', seenBeforeSeal: 'no' },
    { id: 'W6', kind: 'prediction', claim: 'on the real shop months it lowers its claim at least once, and never stands the shop organ down (it is over-claiming, not collapsing)', seenBeforeSeal: 'yes in effect — organ 10’s record shows August–November delivered 76.5–79.4% against 82.9%; the 1,600 window’s bound makes the lowering near-certain' },
    { id: 'W7', kind: 'prediction', claim: 'from the month of its first lowered claim on, its claim at each month’s end is at most 3 points above what that month delivered — while the organism that is not audited over-claims by more than 3 points in at least three months', seenBeforeSeal: 'the second half yes (organ 10’s months: September, October and November over by 5.5–6.4 points); the first half no' },
    { id: 'W8', kind: 'prediction', claim: 'lowering a claim changes what the organism says about its answers, not the answers: on the shop months it answers exactly as many, and as many right, as the organism that is not audited', seenBeforeSeal: 'no' },
  ],
  disclosure: 'This attempt was designed after organ 10’s verdict, knowing its numbers: the shop months’ accuracies, the reversal’s timing and the duplicated-key bug that failed T5 (fixed here: the reversal point is recorded under its own key). The streams, the genome and δ are unchanged. Organ 10’s verdict stands as it was. A failed prediction is kept.',
  judgedBy: 'tools/judge-10b.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-10b/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-10b/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-10b/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
