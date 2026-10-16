#!/usr/bin/env node
// tools/seal-9.mjs — organ 9's pre-registration, committed BEFORE tools/measure-9.mjs runs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/immune.mjs', 'src/mesh.mjs', 'src/gate.mjs', 'src/body.mjs', 'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-9.mjs', 'tools/measure-8.mjs', 'tools/judge-9.mjs', 'tools/seal-9.mjs', 'tools/judge.mjs',
  'test/immune.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-9.prereg', v: 1,
  organ: 'organ 9, the immune system (SENTINEL) — do attacks make it stronger, and does it ever turn on itself?',
  what: 'Four parts in front of every node’s gate (src/immune.mjs): a bounded memory of refused bytes; the rebound (break-it’s cost law: past 16 free refusals a link must pay proof-of-work before it is looked at, 8 bits and one more every 16 refusals, never falling); proofs (a key that signs two different messages on one counter for one organism is in two hands, and the two signed messages are a proof every node checks itself before revoking the key); and a watch on each peer’s behaviour after Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — “GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps,” 2025 — one-class, each peer measured against its own baseline, kept local.',
  scenario: 'Organ 8’s six organisms (same keys, same genomes, same slices of the same real data), 24 rounds × 12 unseen cases (draw 97), the evidence rule routing. Three attacks at once: from round 4 an outsider on two links sends every node 20 forgeries a round per link under trusted keys with made-up signatures, and spends 2^14 hashes a round per link paying the rebound; at round 10 a thief copies farm’s key and counters, gets in first every round and advertises every domain at 0.95 while the real farm carries on; at round 14 south is taken over outright and advertises every domain at 0.97, answering what it draws with south’s own organs. Run as organ 8 (no immune system; organ 8’s antibodies sent on every refusal of injected bytes) and as organ 9, then organ 9 with no attacker on the same draw. Behaviour limits: the largest drift and volume honest rounds reached in a separate organ-9 run on draw 41 with no attacker, × 1.25 (honest rounds only — no attack is used to set them).',
  rules: [
    { id: 'I1', kind: 'property', claim: 'no forgery is admitted, with or without organ 9', seenBeforeSeal: 'in kind — organ 3 and the unit tests' },
    { id: 'I2', kind: 'property', claim: 'it never turns on itself by its own rules: no honest key is revoked by a proof, and no honest node’s link is ever refused by an honest node that still trusts it (so never owes it work), under attack or with no attacker (cuts by behaviour are I3)', seenBeforeSeal: 'in kind — unit tests on a toy mesh' },
    { id: 'I3', kind: 'prediction', claim: 'no honest peer is cut off by behaviour, under attack or with no attacker', seenBeforeSeal: 'no' },
    { id: 'I4', kind: 'property', claim: 'no node’s immune memory grows past its cap (256)', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'I5', kind: 'prediction', claim: 'over the flood, organ 9 checks the signatures of at most a tenth as many forgeries as organ 8', seenBeforeSeal: 'no' },
    { id: 'I6', kind: 'property', claim: 'the work a link owes a node never falls from one flood round to the next', seenBeforeSeal: 'in kind — unit tests of the law' },
    { id: 'I7', kind: 'prediction', claim: 'every honest node has revoked farm’s stolen key by the end of the round it was stolen in', seenBeforeSeal: 'in kind — a toy mesh where a thief clashed with its owner' },
    { id: 'I8', kind: 'prediction', claim: 'the thief black-holes tasks under organ 8, and organ 9 black-holes at most a fifth as many (tasks sent to farm’s key that never come back answered)', seenBeforeSeal: 'no' },
    { id: 'I9', kind: 'prediction', claim: 'every honest node has cut the taken-over south off by the end of the round after the takeover', seenBeforeSeal: 'in kind — a toy mesh where a node’s claims jumped' },
    { id: 'I10', kind: 'prediction', claim: 'the takeover draws more cases under organ 8 than honest south was sent, and organ 9 sends it at most half as many as organ 8', seenBeforeSeal: 'no' },
    { id: 'I11', kind: 'prediction', claim: 'under the same attacks organ 9 answers at least as many tasks right as organ 8 — the defence pays for itself', seenBeforeSeal: 'no' },
    { id: 'I12', kind: 'prediction', claim: 'it gets stronger as it is attacked: in organ 9, the flood’s last five rounds check at most a tenth as many forgeries as its first five', seenBeforeSeal: 'no' },
  ],
  disclosure: [
    'Found while building this organ: organ 8’s shared fingerprints protected nothing the gate did not already refuse — every message is addressed to one organism, so bytes refused by one node are refused by every other node’s gate at its shape check anyway, more cheaply than a hash. Organ 9 no longer shares fingerprints; it shares proofs.',
    'The mesh is round-synchronous, in one process: there is no real timing, so Gary W. Floyd’s “too regular” side of behaviour (scripted rhythm) is not measured here. It would need real devices — the second of the three receipts.',
    'An attacker who behaves exactly like the owner of the key it holds cannot be told from the owner by behaviour; the watch catches attackers who change behaviour to gain (here, by over-claiming).',
    'A revoked key stays revoked: its owner must re-key. The real farm is lost to the mesh once its key is stolen, under either organ; that cost is in I11.',
    'The attacker’s strategies are fixed in advance and written in tools/measure-9.mjs; an outside adversary is the third receipt, not this one.',
    'A failed prediction is kept.',
  ],
  judgedBy: 'tools/judge-9.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-9/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-9/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-9/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
