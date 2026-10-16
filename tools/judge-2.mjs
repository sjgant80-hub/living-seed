#!/usr/bin/env node
// tools/judge-2.mjs — organ 2 (the body) judged against the rules sealed before it was measured.
//   node tools/judge-2.mjs --write   → each rule PASS or FAIL against data/organ-2/record.json, by the sealed rules in
//                                      data/organ-2/prereg.json, written to data/organ-2/verdict.json
//   node tools/judge-2.mjs --check   → re-judges and refuses unless the committed verdict is reproduced exactly
// The rules live here as code and this file is pinned by the seal. A failed prediction is kept, not re-run until it
// passes: --check goes red only on drift or on a failed property (a rule that is not a prediction).
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const DOMAINS = ['shopper', 'triage', 'water', 'crop'];
const all = (xs, f) => xs.every(f);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
const CONDITIONS = ['qwen2.5:14b · zero', 'qwen2.5:14b · few', 'qwen2.5:7b · zero', 'qwen2.5:7b · few', 'llama3.2:1b · zero', 'llama3.2:1b · few'];

export const RULES = {
  B1: (r) => {
    const p = r.patterns;
    const pass = all(DOMAINS, (d) => p[d].sameAsOrgan === p[d].verified && p[d].receiptsCheck === p[d].verified && p[d].verified >= 0.9 * p[d].held && p[d].routedHome >= 0.9 * p[d].held);
    return { pass, saw: DOMAINS.map((d) => d + ' ' + pct(p[d].verified, p[d].held) + ' answered (' + (p[d].sameAsOrgan === p[d].verified ? 'all' : p[d].sameAsOrgan + ' of them') + ' as the organ), ' + pct(p[d].routedHome, p[d].held) + ' routed home').join('; ') };
  },
  B2: (r) => {
    const n = DOMAINS.reduce((a, d) => a + r.far[d].cases, 0), k = DOMAINS.reduce((a, d) => a + r.far[d].abstained, 0);
    return { pass: k === n && r.cross.abstained === r.cross.asked, saw: k + '/' + n + ' far cases abstained; ' + r.cross.abstained + '/' + r.cross.asked + ' cases asked of the wrong organ abstained' };
  },
  B3: (r) => {
    const c = r.cube;
    return { pass: c.exactBySource === c.keysBySource && c.exactLatest === c.keys && c.nearMissAnswered === 0 && c.editsFound === c.edits && c.chain === true,
      saw: c.exactBySource + '/' + c.keysBySource + ' read back exactly by source, ' + c.exactLatest + '/' + c.keys + ' latest; ' + c.nearMissAnswered + ' of ' + c.nearMisses + ' near-miss keys answered; ' + c.editsFound + '/' + c.edits + ' edits found where made' };
  },
  B4: (r) => {
    const m = r.memory;
    return { pass: m.chain === true && m.forgedFound === m.forgedEdits && m.selfFirst >= 0.95 * m.episodes, saw: 'chain ' + (m.chain ? 'whole' : 'broken') + '; ' + m.forgedFound + '/' + m.forgedEdits + ' re-hashed forgeries found; ' + m.selfFirst + '/' + m.episodes + ' recalled first by their own words' };
  },
  B5: (r) => {
    const c = r.contest, ms = CONDITIONS.map((k) => [k, c.models[k]]);
    if (!all(ms, ([, v]) => v && typeof v.auc === 'number')) return { pass: false, saw: 'not every model answered every case' };
    return { pass: all(ms, ([, v]) => c.organ.auc > v.auc), saw: 'organ ' + c.organ.auc + ' vs ' + ms.map(([k, v]) => k + ' ' + v.auc).join(', ') };
  },
  B6: (r) => {
    const c = r.contest, z = c.models['qwen2.5:14b · zero'], f = c.models['qwen2.5:14b · few'];
    if (!z || !f || typeof z.auc !== 'number' || typeof f.auc !== 'number') return { pass: false, saw: 'the 14B did not answer every case' };
    const best = f.auc >= z.auc ? f : z, which = f.auc >= z.auc ? 'few-shot' : 'zero-shot';
    return { pass: best.organLead >= 0.05 && best.organLeadLow95 > 0, saw: 'against the 14B ' + which + ' (AUC ' + best.auc + '): lead ' + best.organLead + ', 95% lower bound ' + best.organLeadLow95 };
  },
  B7: (r) => {
    const c = r.contest, t = c.organ.timing;
    const best = [c.models['qwen2.5:14b · zero'], c.models['qwen2.5:14b · few']].filter((v) => v && typeof v.medianMs === 'number').sort((a, b) => a.medianMs - b.medianMs)[0];   // the 14B at its fastest
    if (!t || !best) return { pass: false, saw: 'no timing' };
    const speed = (best.medianMs * 1000) / t.perAnswerUs, size = best.bytes / c.organ.seedBytes;
    return { pass: speed >= 1e4 && size >= 1e7, saw: 'organ ' + t.perAnswerUs + ' µs per answer vs the 14B median ' + best.medianMs + ' ms (×' + Math.round(speed).toLocaleString('en-GB') + '); ' + c.organ.seedBytes + ' B of seed vs ' + best.bytes.toLocaleString('en-GB') + ' B of weights (×' + Math.round(size).toLocaleString('en-GB') + ')' };
  },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-2.mjs');
if (isMain) {
  const pre = read('data/organ-2/prereg.json'), rec = read('data/organ-2/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-2.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) {
    console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw);
    if (!v.pass && v.kind !== 'prediction') red++;
  }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-2/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-2/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}
