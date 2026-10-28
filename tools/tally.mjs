#!/usr/bin/env node
// tools/tally.mjs — the page's counts, from every committed verdict (each measured organ in data/organs.json, and every
// night of receipt (a)), failures included; and receipt (a)'s night-by-night account, from every judged night's record.
// The nightly job runs --write after each night, so the page never says less than the nights did.
// test/page.test.mjs checks the page against the same sums; CI runs --check.
//   node tools/tally.mjs [--write|--check]   → prints the tally; --write puts it into index.html; --check refuses on drift
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const judged = () => readdirSync(new URL('data/nights/', ROOT)).filter((d) => /^[0-9]+$/.test(d) && existsSync(new URL('data/nights/' + d + '/verdict.json', ROOT))).map(Number).sort((a, b) => a - b);   // a night sealed but not yet judged is not counted yet

export function tally() {
  const organs = JSON.parse(read('data/organs.json'));
  const files = [...Object.entries(organs).filter(([, s]) => s === 'measured').map(([k]) => (k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')),
    ...judged().map((d) => 'data/nights/' + d + '/verdict.json')];
  const vs = files.flatMap((f) => JSON.parse(read(f)).verdicts);
  return { held: vs.filter((v) => v.pass).length + ' of ' + vs.length, tests: String(files.length),
    failed: String(vs.filter((v) => !v.pass && v.kind === 'prediction').length), red: String(vs.filter((v) => !v.pass && v.kind !== 'prediction').length) };
}

/** every judged night, oldest first, as its record and verdict hold it */
export function nights() {
  return judged().map((n) => {
    const r = JSON.parse(read('data/nights/' + n + '/record.json')), v = JSON.parse(read('data/nights/' + n + '/verdict.json')).verdicts;
    return { n, method: r.method || 'pooled',   // night 1's record predates the field; its seal judged October pooled
      adopted: r.organs.filter((o) => o.adopted).map((o) => o.domain), before: r.before.finalAuc, after: r.after.finalAuc,
      held: v.filter((x) => x.pass).length, rules: v.length, failed: v.filter((x) => !x.pass).map((x) => x.id), week: v.find((x) => x.id === 'N4') || null };
  });
}

const f3 = (x) => x.toFixed(3), plural = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
const NAME = { shopper: 'shop', triage: 'triage', water: 'water', crop: 'crop' };
const GATE = { pooled: 'October, beyond its noise', 'time-folds': 'August, September and October, each' };

/** the generated words: each key but block fills every data-nights="key" span; block fills the <!-- nights --> markers */
export function nightWords(ns = nights()) {
  const first = ns[0], last = ns[ns.length - 1], took = ns.filter((x) => x.adopted.length).length, later = ns.slice(1), tookLater = later.filter((x) => x.adopted.length).length;
  const week = ns.filter((x) => x.week).pop();
  const held = ns.reduce((a, x) => a + x.held, 0), rules = ns.reduce((a, x) => a + x.rules, 0);
  const span = 'November–December ' + f3(first.before) + ' → ' + f3(last.after);
  const words = {
    held: held + ' of ' + rules + ' over ' + plural(ns.length, 'night'),
    what: plural(ns.length, 'night') + ': ' + span + ' (origin → now), ' + took + ' adopted a change',
    short: plural(ns.length, 'night') + ' measured, ' + span,
    since: later.length ? 'In the ' + (later.length === 1 ? 'night' : later.length + ' nights') + ' since, under a stricter gate, it has adopted ' + (tookLater ? 'a change on ' + tookLater : 'nothing') : 'The stricter gate has not run yet',
  };
  const rows = ns.map((x) => '<tr><td>' + x.n + '</td><td>' + GATE[x.method] + '</td><td>' + (x.adopted.length ? x.adopted.map((d) => NAME[d]).join(', ') : 'nothing') + '</td><td class="num">' + f3(x.before) + ' → ' + f3(x.after) + '</td><td class="num">' + x.held + ' of ' + x.rules + (x.failed.length ? ' · ' + x.failed.join(', ') + ' failed' : '') + '</td></tr>').join('');
  words.block = '<p><b>' + plural(ns.length, 'night') + '</b> so far. ' + took + ' adopted a change and ' + (ns.length - took) + ' kept the champion. On November–December the champion scores <b>' + f3(last.after) + '</b> now, against <b>' + f3(first.before) + '</b> for the origin genome before night 1. '
    + (last.after > first.before ? 'So far it is better than where it began.' : 'So far it has not got better than where it began, and the self-audit (organ 10b) is what catches a fall in use.') + ' '
    + (week ? 'The week’s rule (N4), sealed into every night from night 7, after night ' + week.n + ': ' + (week.week.pass ? 'held' : 'failed') + ' — ' + week.week.saw.replace(/[<>&]/g, '') + '.' : 'The week’s rule (N4) is sealed into every night from night 7: after it, the champion must score higher on November–December than the origin did.') + '</p>'
    + '<div class="tw"><table data-nights-count="' + ns.length + '"><thead><tr><th>Night</th><th>Its gate: beat the champion on</th><th>Adopted</th><th>November–December, before → after</th><th>Sealed rules held</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  return words;
}

/** the white paper's organ table: which measured verdicts each row counts */
export const PAPER = { 1: ['1'], 2: ['2', '2b', '2c'], 3: ['3'], 4: ['4', '4b'], 5: ['5'], 6: ['6'], 7: ['7'], 8: ['8', '8b', '8c'], 9: ['9', '9b'], 10: ['10', '10b'], 11: ['11', '11b'], 13: ['13', '13b', '13c'], 14: ['14'] };
const verdictOf = (k) => JSON.parse(read(k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')).verdicts;
export function paperCells(organs = JSON.parse(read('data/organs.json'))) {
  return Object.fromEntries(Object.entries(PAPER).map(([n, ks]) => [n, ks.filter((k) => organs[k] === 'measured').map((k) => { const v = verdictOf(k); return v.filter((x) => x.pass).length + ' of ' + v.length; }).join(' · ')]));
}

/** organ 2b's words: sealed and being asked, or what its record and verdict say. block fills <!-- 2b -->, what fills data-2b="what" */
export function words2b(r = null, v = null) {
  if (!r) return { block: '<p id="h2b-words">Organ 2b settles it. Sealed before a new case was asked, it puts the same 14B, shown the same 24 examples, against the organ on 1,200 more November–December sessions that organ 2 never asked. It is being asked on this machine, one session at a time, and this paragraph fills in from its record when it is judged.</p>', what: 'organ 2b, 1,200 more sessions, sealed and being asked' };
  const pass = Object.fromEntries(v.map((x) => [x.id, x.pass])), f = r.fresh, t = r.together, f3 = (x) => x.toFixed(3), f4 = (x) => x.toFixed(4), gb = (x) => x.toLocaleString('en-GB');
  const call = pass.C2 ? 'a win beyond the noise (C2 held)' : pass.C3 ? 'still a tie, but the organ is not worse by more than ' + r.margin + ' (C2 failed and is kept; C3 held)' : 'the organ may be worse by more than ' + r.margin + ' (C2 and C3 failed, and are kept)';
  return {
    block: '<p class="answer" id="h2b-words"><b>Organ 2b settled it</b> on ' + gb(f.cases) + ' new sessions, sealed before the model was asked a single one. The organ scored <b>' + f4(f.organ) + '</b>, the 14B shown 24 examples <b>' + f4(f.model) + '</b>. The organ’s lead is ' + f4(f.lead) + ', with a 95% lower bound of ' + f4(f.leadLow95) + ': ' + call + '. '
      + (pass.C4 ? 'Both scored within 0.03 of what organ 2’s 300 gave, so those 300 were representative (C4 held).' : 'At least one scored more than 0.03 away from what organ 2’s 300 gave (C4 failed, kept).')
      + ' On all ' + gb(t.cases) + ' sessions together: the organ ' + f4(t.organ) + ', the 14B ' + f4(t.model) + '.' + (f.unreadable ? ' ' + f.unreadable + ' of the 14B’s replies could not be read, and each counts as 0.5.' : '') + '</p>',
    what: 'on 1,200 new sessions (organ 2b) ' + (pass.C2 ? 'a win' : 'still a tie') + ', lead ' + f3(f.lead) + ', bound ' + f3(f.leadLow95),
  };
}

/** the page with every count and every generated word put in */
export function render(html, t = tally(), w = nightWords()) {
  for (const [k, v] of Object.entries(t)) html = html.replace(new RegExp('(data-tally="' + k + '">)[^<]*(<)', 'g'), '$1' + v + '$2');
  for (const k of ['held', 'failed']) html = html.replace(new RegExp('(data-paper="' + k + '">)[^<]*(<)', 'g'), '$1' + t[k] + '$2');   // the white paper's own totals
  html = html.replace(/(all fourteen organs, )[0-9]+ of [0-9]+( sealed rules held)/, '$1' + t.held + '$2');   // the meta description
  for (const [k, v] of Object.entries(w)) if (k !== 'block') html = html.replace(new RegExp('(data-nights="' + k + '">)[^<]*(<)', 'g'), '$1' + v + '$2');
  for (const [n, v] of Object.entries(paperCells())) html = html.replace(new RegExp('(data-held="' + n + '">)[^<]*(<)'), '$1' + v + '$2');
  html = html.replace(/(data-held="12">)[^<]*(<)/, '$1' + w.held + '$2');
  const measured2b = JSON.parse(read('data/organs.json'))['2b'] === 'measured', b = measured2b ? words2b(JSON.parse(read('data/organ-2b/record.json')), verdictOf('2b')) : words2b();
  html = html.replace(/(data-2b="what">)[^<]*(<)/, '$1' + b.what + '$2').replace(/(<!-- 2b -->)[\s\S]*?(<!-- \/2b -->)/, '$1' + b.block + '$2');
  return html.replace(/(<!-- nights -->)[\s\S]*?(<!-- \/nights -->)/, '$1' + w.block + '$2');
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/tally.mjs');
if (isMain) {
  const t = tally(), html = read('index.html'), out = render(html, t);
  console.log('sealed rules held ' + t.held + ' across ' + t.tests + ' tests · ' + t.failed + ' predictions failed · ' + t.red + ' properties red · ' + nights().length + ' nights judged');
  if (process.argv.includes('--write')) { writeFileSync(new URL('index.html', ROOT), out); console.log('wrote the tally and the nights into index.html'); }
  if (process.argv.includes('--check')) {
    if (!html.includes('<!-- nights -->') || !html.includes('<!-- 2b -->') || !html.includes('data-2b="what"') || out !== html) { console.log('TALLY DRIFT · index.html does not say what the verdicts and the nights say — run node tools/tally.mjs --write'); process.exit(1); }
    console.log('the page says what the verdicts and the nights say');
  }
}
