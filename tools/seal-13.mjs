#!/usr/bin/env node
// tools/seal-13.mjs — organ 13's pre-registration, committed BEFORE tools/measure-13.mjs grows the real system. It pins
// every file the measurement and its judge load (followed through every import, not listed by hand) and the data they read.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
function loaded(entries) {
  const seen = new Set();
  const walk = (url) => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const m of readFileSync(url, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)) walk(new URL(m[1], url));
  };
  for (const e of entries) walk(new URL(e, ROOT));
  return [...seen].map((h) => h.slice(ROOT.href.length));
}
const FILES = [...new Set([
  ...loaded(['tools/measure-13.mjs', 'tools/judge-13.mjs', 'tools/seal-13.mjs', 'test/system.test.mjs']),
  'vendor/fall-kit-core/FALL-KIT-CORE.json', 'vendor/fall-kit-core/NOTICE',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json', 'data/record.json', 'data/organ-4b/record.json', 'data/organ-5/record.json',
])].sort();

const prereg = {
  kind: 'living-seed.organ-13.prereg', v: 1,
  organ: 'organ 13 — the seed grows the whole system: one genome, one device’s data and its owner’s phrase grow the organism and the system it lives in (a node per live organ, a keeper, keys, a signed roster), gated, breedable and portable',
  design: 'Organ 1’s origin genome is sealed again (the same bytes) and grown on the reference device with a public phrase, on the estate’s shared foundation (vendor/fall-kit-core, copied unchanged): each live organ becomes a node whose one skill is the organ’s answer with a receipt; a keeper node asks them, and checks every answer by running the organ again on the case it asked; the owner’s keys are worked out from the phrase and the founder signs a roster from which every node pins every other. The keeper asks every held-out case through signed packets, with the network trapped. Then: two devices where an organ cannot be proved; every one-character and one-bit change at the genome, the roster and both doors; a liar and a stale organ holding real keys; organ 5’s child, bred again, growing its own system; and a fingerprint of the system that a browser tab must reproduce.',
  rules: [
    { id: 'S1', kind: 'property', claim: 'one genome grows the whole system, offline: organ 1’s origin genome (at most 2,048 bytes), on the reference device with its owner’s phrase, grows the organism and the system it lives in — a node of the shared foundation for each live organ (all four) and a keeper, the keys worked out from the phrase, a roster the founder signs, every node pinning every other from it — and growing it and asking it every held-out case touch the network 0 times (fetch, XMLHttpRequest, WebSocket, sockets, datagrams and name lookups trapped); no file it loads names a network module', seenBeforeSeal: 'yes, once — a timing probe grew this system before the seal (its network not trapped)' },
    { id: 'S2', kind: 'property', claim: 'the system adds no error: the keeper asks every held-out case of every organ as a signed packet; every answer comes back and the keeper verifies each by running the organ again; each equals the organism’s own answer; the AUC of the answers that crossed, to six places, is each organ’s held-out AUC; and the keeper’s ledger credits every one', seenBeforeSeal: 'partly — the probe asked 400 cases per organ, all verified, and the AUC of the organism’s direct answers matched each held AUC' },
    { id: 'S3', kind: 'property', claim: 'it grows only what is verified: on the noisy-shop device the shop organ is cut and grows no node (keeper, triage, water, crop; a roster of 4; the keeper cannot ask the shop); on the no-water device the water organ is dormant and grows no node; a genome changed in one character grows nothing at all — no keys, no nodes', seenBeforeSeal: 'in kind — organ 5 (C5) for the organism; unit tests for the system' },
    { id: 'S4', kind: 'prediction', claim: 'one door at every scale: every one-character change to the genome (every position) grows nothing; every one-character change to the signed roster is refused when it is read; every one-bit change to an ask is refused at the organ’s door, and every one-bit change to its answer at the keeper’s door; afterwards the genuine answer is verified and credited once; the same ask and the same answer sent again are refused', seenBeforeSeal: 'in kind — organ 1 refused every change to the genome, and the foundation’s own batteries refused forged packets; never on this system’s roster or packets' },
    { id: 'S5', kind: 'prediction', claim: 'the keeper cannot be lied to: a node holding the triage organ’s own key that answers in its place, every label flipped and every receipt sealed again so that it holds, is caught on 100 of 100 asks; a node holding the child’s shop key that answers honestly but from the parent organism (a stale organ) is caught on 100 of 100; neither is credited', seenBeforeSeal: 'in kind — a unit test caught one lie on a toy' },
    { id: 'S6', kind: 'property', claim: 'it breeds: organ 5’s child (origin × evolved), bred again here byte for byte, grows its own system on the reference device — its genome names both parents; a keeper and four organ nodes, every node pinning every other; 100 held-out cases per organ asked through its mesh, all verified; its organism is neither parent’s; its shop organ’s held-out AUC is at least both parents’', seenBeforeSeal: 'in kind — organ 5 measured the child’s organism and its shop AUC (0.827767, against 0.815265 and 0.802782)' },
    { id: 'S7', kind: 'prediction', claim: 'it runs the same in a browser tab: given the same genome, data and phrase, a tab grows the same system — the same organism, the same signed roster and the same receipts for the first 25 held-out cases of each organ asked through its mesh: one fingerprint, equal to this record’s — in under 10 seconds (Node on GitHub’s Linux runner re-runs this record byte for byte in CI; the tab is the third kind of machine)', seenBeforeSeal: 'no — never run in a tab' },
  ],
  disclosure: 'Before this seal: src/system.mjs was built, unit-tested (7 tests) and mutation-gated (24 of 24 mutants killed) on a toy organism and a two-organ genome, and fuzzed — 0 of 37,905 garbage calls threw, after one fix (a case that refers to itself, or holds what JSON cannot write, is now an abstention, not a throw). A timing probe grew this exact system once on the reference device and asked 400 held-out cases per organ through it: all 1,600 verified, about 21 ms per round trip; the AUC of the organism’s direct answers equalled each held AUC to six places. This measurement was run once in smoke mode (3 cases per step) to check that it runs end to end; its numbers were not read. So S1, S2, S3 and S6 are properties, and S4, S5 and S7 are predictions. Scope: everything here runs in one process. The nodes exchange the same signed packets a wire would carry, in memory; this is not a network of devices. Three of the four domains are seed-library’s synthetic data; the shop is real (UCI Online Shoppers). The node keys come from the owner’s phrase and each node’s role, not from the genome, so two systems grown with one phrase share keys role for role; what keeps one generation from answering for another is the receipt, which names the organism (S5). The phrase here is public so that anyone can reproduce the record; a real owner keeps theirs secret. The liar and the stale organ answer in the organ’s place from the start (a node taken over); one that joins late with the key alone is refused at the door as a replay (unit-tested, not claimed here). The tab’s fingerprint is what the browser reported; anyone can press the button on the page and compare. A failed prediction is kept.',
  judgedBy: 'tools/judge-13.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-13/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-13/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-13/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
