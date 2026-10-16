#!/usr/bin/env node
// tools/seal-11.mjs — organ 11's pre-registration, committed BEFORE tools/measure-11.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/organism.mjs', 'src/align.mjs', 'src/card.mjs', 'src/evolve.mjs', 'src/body.mjs', 'src/germinate.mjs', 'src/genome.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/record.json',
  'tools/measure-11.mjs', 'tools/measure-10.mjs', 'tools/judge-11.mjs', 'tools/seal-11.mjs', 'tools/judge.mjs',
  'test/organism.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-11.prereg', v: 1,
  organ: 'organ 11, the full organism — one season, every step through its gate, on two devices that never share a row',
  what: 'src/organism.mjs composes the organs into a life: boot from a card under trust (organs 5, 1); live, licensed, chained and self-audited (organs 2, 10); remember — a signed memory that wakes only by living itself again to the same head; improve — evolution on the device’s own labelled history, blind to the slice it is judged on, adopted only if it beats the organ it would replace by the margin (organs 4, 3), the device sealing a child that names its parent; reproduce as a card (organ 5); spread to another device that boots it under its own trust.',
  scenario: 'The REAL shop sessions split into two devices that never share a row: A the even sessions, B the odd. Organ 1’s origin genome arrives at A as a card; A grows it on February–May, claims on June–July, lives August–September (audited at organ 10b’s three scales), remembers, stops, wakes and lives October; improves on February–May + August–September judged on October (30 generations × 8 children, 3 folds, as organ 4b); its child lives A’s November–December, beside the parent. The child goes to B as a card; B grows it on its own February–May + August–September (claim on October) and lives its own November–December, beside the origin genome on the same data. The memory is tampered with five ways; B is handed the card without trusting A.',
  rules: [
    { id: 'K1', kind: 'property', claim: 'the season completes, every step through its gate: the card boots under trust, every life’s ledger holds, A seals a child that opens and names its parent, the child becomes a card, B boots it trusting A and grows it on its own data', seenBeforeSeal: 'in kind — unit tests on a toy world' },
    { id: 'K2', kind: 'property', claim: 'A wakes from its signed memory at the same head; carrying on from it equals never having stopped; and a memory with a truth changed, a case dropped (signed by another device or by A itself), its head changed, or different data under it, will not wake', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'K3', kind: 'property', claim: 'B refuses the card when A’s key is not on its trust list', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'K4', kind: 'prediction', claim: 'improving on A’s own history, the gate adopts at least one evolved organ', seenBeforeSeal: 'no — organ 4b adopted 2 of 4 on other data; the toy adopted 1 of 1' },
    { id: 'K5', kind: 'prediction', claim: 'on A’s November–December, the child scores its answers at least as well (AUC) as the parent would have', seenBeforeSeal: 'no' },
    { id: 'K6', kind: 'prediction', claim: 'every organ the child carries is live on B, by B’s own gate on B’s own October', seenBeforeSeal: 'no' },
    { id: 'K7', kind: 'prediction', claim: 'on B’s November–December — customers A never saw — the child scores at least as well (AUC) as the origin genome grown on the same data: the improvement travels', seenBeforeSeal: 'no' },
    { id: 'K8', kind: 'prediction', claim: 'on both devices the shop organ ends November–December still live, its claim at most 3 points above what it delivered', seenBeforeSeal: 'in kind — organ 10b on all the sessions (claim lowered to 0.775; November delivered 0.765, December 0.858)' },
  ],
  disclosure: [
    'A memory holds the cases and the truths the device was told; living it again checks that the acts follow from them and from the data, not that the world told the truth — a truth that changed no act leaves the same life, so the device’s signature is what vouches for it (unit-tested and said on the page).',
    'Coupling — the mesh and its immune system — is measured in organ 9’s run, which composes organs 1, 2, 3, 8 and 9; the self-model in organ 7. They are not re-run here.',
    'The devices are two halves of one real dataset in one process, not two machines. N real devices is the second of the three receipts.',
    'A failed prediction is kept.',
  ],
  judgedBy: 'tools/judge-11.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-11/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-11/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-11/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
