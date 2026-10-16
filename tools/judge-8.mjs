#!/usr/bin/env node
// tools/judge-8.mjs — organ 8 (the mesh) judged against the rules sealed before it ran.
//   --write → data/organ-8/verdict.json      --check → refuse on drift. A failed prediction is kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const pc = (x) => Math.round(x * 1000) / 10 + '%';

export const RULES = {
  N1: (r) => { const a = r.attack; return { pass: r.gate.admitted === r.gate.sent && a.admitted === 0 && a.onSightAfter === a.replayedTo && a.replayedTo > 0,
    saw: r.gate.admitted + '/' + r.gate.sent + ' real messages admitted (' + r.gate.lost + ' could not be delivered); ' + a.admitted + ' of ' + (a.tried + a.replayedTo) + ' attacks admitted; ' + a.onSightAfter + '/' + a.replayedTo + ' replays at other nodes refused on sight after the warning' }; },
  N2: (r) => ({ pass: r.tasks.answered >= 0.95 && r.tasks.alone.answered <= 0.7, saw: 'the mesh answered ' + pc(r.tasks.answered) + ' of ' + r.tasks.total + ' tasks; each node alone would have answered ' + pc(r.tasks.alone.answered) }),
  N3: (r) => ({ pass: r.tasks.right >= r.tasks.alone.right - 0.03, saw: 'right on ' + pc(r.tasks.right) + ' of what the mesh answered, against ' + pc(r.tasks.alone.right) + ' of what nodes answered alone' }),
  N4: (r) => {
    const got = r.grown.filter((g) => g.from).map((g) => g.node + ':' + g.domain).sort(), refused = r.grown.filter((g) => g.refused).map((g) => g.node + ':' + g.domain).sort();
    const ok = JSON.stringify(got) === '["clinic:triage","farm:shopper"]' && JSON.stringify(refused) === '["noisy:shopper"]' && r.specialists.every((s) => s.heldAuc >= 0.6 && s.afterAtHome === s.afterTasks && s.afterTasks > 0);
    return { pass: ok, saw: 'grew ' + (got.join(', ') || 'none') + '; refused ' + (refused.join(', ') || 'none') + '; ' + r.specialists.map((s) => s.node + '’s ' + s.domain + ' specialist: AUC ' + s.heldAuc + ' on its own unseen cases, ' + s.afterAtHome + '/' + s.afterTasks + ' later tasks answered at home, ' + pc(s.afterRight) + ' right (routed before: ' + pc(s.routedBeforeRight) + ' of ' + s.routedBefore + ')').join('; ') };
  },
  N5: (r) => ({ pass: r.tasks.after.answered >= 0.9, saw: 'with two of six nodes lost from round 12, the mesh still answered ' + pc(r.tasks.after.answered) + ' (before the loss: ' + pc(r.tasks.before.answered) + ')' }),
  N6: (r) => ({ pass: r.healed.identical === true, saw: 'after the partition healed, the capability maps of ' + r.healed.nodes.join(', ') + ' are ' + (r.healed.identical ? 'identical' : 'NOT identical') }),
  N7: (r) => { const c = Object.entries(r.concentration); return { pass: c.length > 0 && c.every(([, x]) => x.share >= 0.7), saw: c.map(([d, x]) => d + ': ' + pc(x.share) + ' of ' + x.routed + ' routed tasks to ' + x.top).join('; ') + ' (the last 8 rounds)' }; },
};

export function judge(prereg, record) {
  return prereg.rules.map((rule) => {
    let v;
    try { v = RULES[rule.id] ? RULES[rule.id](record) : { pass: false, saw: 'no such rule in the judge' }; } catch (e) { v = { pass: false, saw: 'the record could not be read: ' + e.message }; }
    return { id: rule.id, kind: rule.kind, claim: rule.claim, pass: v.pass === true, saw: v.saw };
  });
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/judge-8.mjs');
if (isMain) {
  const pre = read('data/organ-8/prereg.json'), rec = read('data/organ-8/record.json');
  const verdicts = judge(JSON.parse(pre), JSON.parse(rec));
  const text = JSON.stringify({ kind: 'living-seed.organ-8.verdict', v: 1, prereg: sha256Hex(pre).slice(0, 16), record: sha256Hex(rec).slice(0, 16), verdicts }, null, 1) + '\n';
  let red = 0;
  for (const v of verdicts) { console.log((v.pass ? 'PASS ' : 'FAIL ') + v.id + (v.kind === 'prediction' ? ' (prediction)' : '') + ' · ' + v.saw); if (!v.pass && v.kind !== 'prediction') red++; }
  const failed = verdicts.filter((v) => !v.pass).map((v) => v.id);
  if (process.argv.includes('--write')) writeFileSync(new URL('data/organ-8/verdict.json', ROOT), text);
  if (process.argv.includes('--check') && read('data/organ-8/verdict.json') !== text) { console.log('VERDICT DRIFT · the committed verdict is not what the sealed rules give'); red++; }
  console.log((red ? 'RED · ' : 'JUDGED · ') + (failed.length ? failed.join(', ') + ' failed as sealed — kept' : 'every rule passed as sealed'));
  process.exit(red ? 1 : 0);
}
