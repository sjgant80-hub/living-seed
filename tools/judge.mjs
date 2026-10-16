#!/usr/bin/env node
// tools/judge.mjs — organ 1 judged against the rules sealed before it was measured.
//   node tools/judge.mjs --write     → each rule PASS or FAIL against data/record.json, by the sealed rules in
//                                      data/prereg.json, written to data/verdict.json
//   node tools/judge.mjs --check     → re-judges and refuses unless the committed verdict is reproduced exactly
//   … --history                      → also proves the order from git: the seal was committed strictly before the record,
//                                      and the code that made the record is the code the seal pinned, byte for byte
// The rules live here as code, and this file is one of the files the seal pins: what counts as a pass cannot move after
// the numbers are in. A FAIL is kept — a prediction that failed is a result, not something to hide — so --check passes on a
// verdict reproduced as committed, failures and all, and goes red only on drift, a broken order, or a failed property
// (a rule that is not a prediction: those are what the build claims to be, and must hold).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sha256Hex, sha256Bytes, toHexStr } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
/** A file's pin: the SHA-256 of its exact bytes. */
export const fileHash = (bytes) => toHexStr(sha256Bytes(bytes));
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const DOMAINS = ['shopper', 'triage', 'water', 'crop'];
const organ = (rec, sub, d) => rec.organisms[sub].organs.find((x) => x.domain === d);
const all = (xs, f) => xs.every(f);

/** The rules, by id. Each takes the record and returns { pass, saw } — saw: what the record holds, in plain words. */
export const RULES = {
  R1: (r) => ({ pass: r.genome.bytes <= 512 && r.genome.organs === 4, saw: r.genome.organs + ' organs in ' + r.genome.bytes + ' bytes' }),
  R2: (r) => ({ pass: r.offline.networkTouched === 0 && r.offline.substrates === 5, saw: r.offline.networkTouched + ' network calls over ' + r.offline.substrates + ' germinations' }),
  R3: (r) => {
    const exact = all(DOMAINS, (d) => r.reproduce.grown[d] === r.reproduce.sealed[d]);
    const called = all(DOMAINS, (d) => { const c = r.organisms.reference.calls[d], o = organ(r, 'reference', d); return c.verified === c.held && Math.round((c.right / c.held) * 1e6) / 1e6 === o.heldAcc; });
    return { pass: exact && called, saw: DOMAINS.map((d) => d + ' ' + r.reproduce.grown[d] + (r.reproduce.grown[d] === r.reproduce.sealed[d] ? ' =' : ' ≠') + ' sealed').join(', ') + (called ? '; every held case answered at the graded accuracy' : '; the calls do not match the grade') };
  },
  R4: (r) => ({ pass: r.tamper.refused === r.tamper.positions && r.tamper.makerSwapped === 'signature' && r.tamper.untrustedMaker === 'untrusted maker',
    saw: r.tamper.refused + '/' + r.tamper.positions + ' one-character changes refused; maker swapped → ' + r.tamper.makerSwapped + '; another maker trusted → ' + r.tamper.untrustedMaker }),
  R5: (r) => { const s = r.organisms.reference.sizes; return { pass: s.ratio >= 2, saw: 'grows ' + s.grownBytes + ' bytes of rules from ' + s.genomeBytes + ' carried (×' + s.ratio + ')' }; },
  R6: (r) => {
    const ids = ['reference', 'device-a', 'device-b'].map((s) => r.organisms[s].id);
    const near = ['device-a', 'device-b'].flatMap((s) => DOMAINS.map((d) => ({ s, d, o: organ(r, s, d), ref: organ(r, 'reference', d) })));
    const pass = new Set(ids).size === 3 && all(near, ({ o, ref }) => o.state === 'live' && Math.abs(o.heldAuc - ref.heldAuc) <= 0.03);
    return { pass, saw: near.map(({ s, d, o, ref }) => s.slice(-1) + '/' + d + ' ' + o.state + (o.heldAuc === undefined ? '' : ' ' + o.heldAuc + ' (Δ' + (Math.round((o.heldAuc - ref.heldAuc) * 1e6) / 1e6) + ')')).join(', ') + '; ' + new Set(ids).size + ' distinct ids' };
  },
  R7: (r) => ({ pass: r.deterministic.same === true && r.deterministic.ids.length === 3 && r.deterministic.ids[0] === r.organisms.reference.id, saw: '3 more germinations → ' + [...new Set(r.deterministic.ids)].join(', ') }),
  R8: (r) => {
    const s = organ(r, 'shuffled-shopper', 'shopper'), c = r.organisms['shuffled-shopper'].calls;
    const others = DOMAINS.filter((d) => d !== 'shopper');
    const pass = s.state === 'cut' && s.heldAuc >= 0.45 && s.heldAuc <= 0.55 && c.shopper.verified === 0 && all(others, (d) => c[d].verified === c[d].held);
    return { pass, saw: 'shopper ' + s.state + ' at AUC ' + s.heldAuc + ', ' + c.shopper.abstained + '/' + c.shopper.held + ' abstained; ' + others.map((d) => d + ' ' + c[d].verified + '/' + c[d].held + ' answered').join(', ') };
  },
  R9: (r) => {
    const w = organ(r, 'no-water', 'water'), c = r.organisms['no-water'].calls;
    const others = DOMAINS.filter((d) => d !== 'water');
    const pass = w.state === 'dormant' && c.water.verified === 0 && all(others, (d) => organ(r, 'no-water', d).state === 'live' && c[d].verified === c[d].held);
    return { pass, saw: 'water ' + w.state + ', ' + c.water.abstained + '/' + c.water.held + ' abstained; ' + others.map((d) => d + ' ' + c[d].verified + '/' + c[d].held).join(', ') + ' answered' };
  },
};

/** Judge a record by a sealed pre-registration. → [{ id, kind, claim, pass, saw }] — a rule the seal names but this file
 *  does not know is a FAIL, never a skip. */
export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

/** From git: the seal's first commit is a strict ancestor of the record's first commit, and every file the seal pins is
 *  byte-identical in the record's commit. → { ok, why, seal, record } */
export function history(prereg) {
  const git = (...a) => execFileSync('git', a, { cwd: new URL('.', ROOT), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const first = (p) => git('log', '--diff-filter=A', '--format=%H', '--', p).trim().split('\n').filter(Boolean).pop();
  const seal = first('data/prereg.json'), record = first('data/record.json');
  if (!seal || !record) return { ok: false, why: 'the seal or the record is not committed' };
  if (seal === record) return { ok: false, why: 'the seal and the record came in the same commit', seal, record };
  try { git('merge-base', '--is-ancestor', seal, record); } catch { return { ok: false, why: 'the seal was not committed before the record', seal, record }; }
  for (const [path, hash] of Object.entries(prereg.files)) {
    let bytes;
    try { bytes = execFileSync('git', ['show', record + ':' + path], { cwd: new URL('.', ROOT) }); } catch { return { ok: false, why: path + ' is missing from the record commit', seal, record }; }
    if (fileHash(bytes) !== hash) return { ok: false, why: path + ' changed between the seal and the measurement', seal, record };
  }
  return { ok: true, why: 'sealed in ' + seal.slice(0, 7) + ', measured in ' + record.slice(0, 7) + ' on the very code it pinned', seal, record };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge.mjs');
if (isMain) {
  const prereg = JSON.parse(read('data/prereg.json')), record = JSON.parse(read('data/record.json'));
  const verdicts = judge(prereg, record);
  const text = JSON.stringify({ kind: 'living-seed.organ-1.verdict', v: 1, prereg: sha256Hex(read('data/prereg.json')).slice(0, 16), record: sha256Hex(read('data/record.json')).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  if (process.argv.includes('--history')) {
    const h = history(prereg);
    console.log((h.ok ? 'ORDER ✓ ' : 'ORDER ✗ ') + h.why);
    if (!h.ok) red++;
  }
  for (const v of verdicts) {
    console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw);
    if (!v.pass && v.kind !== 'prediction') red++;
  }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}
