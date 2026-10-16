#!/usr/bin/env node
// tools/seal-5.mjs — organ 5's pre-registration, committed BEFORE tools/measure-5.mjs breeds the real genomes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/genome.mjs', 'src/germinate.mjs', 'src/card.mjs', 'src/breed.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/organ-4b/record.json',
  'tools/measure-5.mjs', 'tools/judge-5.mjs', 'tools/seal-5.mjs', 'tools/judge.mjs',
  'test/card.test.mjs', 'test/breed.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-5.prereg', v: 1,
  organ: 'organ 5 — breeding (two genomes make a child that carries both lineages) and the card (the organism travels as a picture)',
  design: 'Parent 1 is the origin genome. Parent 2 is the evolved line: organ 4’s second-design champions for all four domains, sealed by peer-1 as a child of the origin. They breed on the reference device (seed 1, sealed by peer-2): where both carry a domain, their rules are crossed rule by rule; the child is then grown there and keeps only organs that go live. The child breeds again with the origin (a grandchild). Each genome becomes a 256 × 256 PNG card; the child’s card is attacked, and traded to two devices that each hold half the history.',
  rules: [
    { id: 'C1', kind: 'property', claim: 'all four genomes (origin, evolved, child, grandchild) become cards of at most 200,000 bytes that read back to the exact genome, and the same genome makes the same card twice', seenBeforeSeal: 'for the origin — unit tests' },
    { id: 'C2', kind: 'property', claim: 'every one of 300 random damages to the child’s card is refused; every one-byte change to the genome in its pixels, re-wrapped with fresh checksums, is refused by the seal; every truncation is refused; and the card re-compressed by another tool still opens', seenBeforeSeal: 'in kind — unit tests on the origin’s card' },
    { id: 'C3', kind: 'prediction', claim: 'on the reference device the child keeps all four organs live — nothing dropped', seenBeforeSeal: 'no — no real child has been bred' },
    { id: 'C4', kind: 'prediction', claim: 'on every domain the child’s organ scores on unseen cases at least the worse parent’s (less 0.005), and on at least one domain at least the better parent’s', seenBeforeSeal: 'no' },
    { id: 'C5', kind: 'property', claim: 'bred on the noisy-shop device the child drops exactly its shop organ (cut) and carries three; bred on the no-water device it drops exactly its water organ (dormant) and carries three', seenBeforeSeal: 'in kind — unit tests on a toy domain' },
    { id: 'C6', kind: 'property', claim: 'the child’s card opens on device A and device B that trust its breeder — the same genome, two different organisms, each grown on its own half of the history — and is refused under a stranger’s trust list', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'C7', kind: 'prediction', claim: 'on both half-history devices every organ the child carries goes live', seenBeforeSeal: 'no' },
    { id: 'C8', kind: 'property', claim: 'the lineage holds: evolved names the origin; the child names origin and evolved, at the higher bar (0.6); the grandchild names the child and the origin, all its organs live', seenBeforeSeal: 'in kind — unit tests on a toy domain' },
  ],
  disclosure: 'The card and breeding kernels were built and unit-tested before this seal, the card on the origin genome and breeding only on a toy domain, so no real child has been grown. The second parent’s recipes are organ 4b’s committed champions, whose unseen-case scores are known (the shop’s is worse than the origin’s, water’s and crop’s better). C4 is therefore a prediction about crossover, not about the parents. A failed prediction is kept.',
  judgedBy: 'tools/judge-5.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-5/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-5/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-5/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
