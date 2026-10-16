#!/usr/bin/env node
// tools/seal-8.mjs — organ 8's pre-registration, committed BEFORE tools/measure-8.mjs runs the mesh on the real domains.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileHash } from './judge.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = [
  'src/mesh.mjs', 'src/gate.mjs', 'src/body.mjs', 'src/genome.mjs', 'src/germinate.mjs',
  'vendor/seed-library/seedlib.mjs', 'vendor/seed-library/sha256.mjs', 'vendor/seed-library/domains.mjs',
  'vendor/keys/keys.mjs', 'vendor/keys/canon.mjs',
  'data/online_shoppers_intention.csv', 'data/seed-library-run.json',
  'tools/measure-8.mjs', 'tools/judge-8.mjs', 'tools/seal-8.mjs', 'tools/judge.mjs',
  'test/mesh.test.mjs',
];

const prereg = {
  kind: 'living-seed.organ-8.prereg', v: 1,
  organ: 'organ 8 — the mesh: organisms on their own devices advertise, route, learn which links pay, grow the specialists they lack, share antibodies, and survive loss and partition (with Simon’s mesh-of-specialists spec of 2026-10-16 folded in)',
  design: 'Six nodes, each its own organism from its own genome on its own slice of the real domains: north and south hold a third of every domain’s history; shop-floor only shop data; clinic’s genome lacks a triage organ but its device holds triage and water data; farm’s genome is only crop but it holds crop and shop data; noisy holds shop data with no signal (labels shuffled) and water data. 24 rounds × 12 unseen cases, each arriving at a node. Round 6: an outsider forges a task to every node, and a message under south’s key on a spent counter is replayed to all. Round 12: south and shop-floor are lost. Rounds 16–19: the mesh is cut in two (north, clinic, farm | the rest); round 20 it heals. Every message is a signed envelope through organ 3’s gate.',
  rules: [
    { id: 'N1', kind: 'property', claim: 'every real message is admitted by the gate; not one attack is; and once warned, every other node refuses the replayed bytes on sight', seenBeforeSeal: 'in kind — the unit tests on a toy mesh' },
    { id: 'N2', kind: 'prediction', claim: 'the mesh answers at least 95% of the tasks; the same nodes alone would answer at most 70%', seenBeforeSeal: 'no' },
    { id: 'N3', kind: 'prediction', claim: 'routing does not cost quality: the mesh is right on at least as large a share of what it answers as nodes alone are on theirs, less 0.03', seenBeforeSeal: 'no' },
    { id: 'N4', kind: 'prediction', claim: 'gap-sensing grows exactly two specialists — the clinic’s triage organ and the farm’s shop organ — and the noisy node’s request for a shop lesson is refused on its own data; each grown specialist clears the 0.6 gate on its own device’s unseen cases and answers every later task of its domain at home', seenBeforeSeal: 'no — the unit tests grew a specialist on a toy domain only' },
    { id: 'N5', kind: 'property', claim: 'with two of the six nodes lost, the mesh still answers at least 90% of the tasks', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'N6', kind: 'property', claim: 'after the partition heals, every live node holds the identical capability map', seenBeforeSeal: 'in kind — unit tests' },
    { id: 'N7', kind: 'prediction', claim: 'the links concentrate: in the last 8 rounds, for every domain, at least 70% of routed tasks go to one node — the web has drawn itself from use', seenBeforeSeal: 'no' },
  ],
  disclosure: 'The six nodes run in one process here, so this measures the mesh’s logic and its signed messages, not a radio network. Every message is the same signed envelope a real link would carry. A run across real devices is receipt (b) of organ 12 and is not claimed by this organ. The specialists grown are seed-library organs adopted by lesson, not trained language models; training a small model per specialist (fallforgemint) is not part of this organ.',
  judgedBy: 'tools/judge-8.mjs (pinned below)',
  files: Object.fromEntries(FILES.map((p) => {
    const bytes = readFileSync(new URL(p, ROOT));
    if (bytes.includes(13)) { console.log('REFUSED · ' + p + ' holds a carriage return'); process.exit(1); }
    return [p, fileHash(bytes)];
  })),
};

mkdirSync(new URL('data/organ-8/', ROOT), { recursive: true });
writeFileSync(new URL('data/organ-8/prereg.json', ROOT), JSON.stringify(prereg, null, 1) + '\n');
console.log('sealed data/organ-8/prereg.json · ' + prereg.rules.length + ' rules (' + prereg.rules.filter((r) => r.kind === 'prediction').length + ' predictions) · ' + FILES.length + ' files pinned');
