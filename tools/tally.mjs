#!/usr/bin/env node
// tools/tally.mjs — the header's tally, from every committed verdict (each measured organ in data/organs.json, and every
// night of receipt (a)), failures included. test/page.test.mjs checks the page against the same sums.
//   node tools/tally.mjs [--write]   → prints the tally; --write puts it into index.html's data-tally spans
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export function tally() {
  const organs = JSON.parse(read('data/organs.json'));
  const files = [...Object.entries(organs).filter(([, s]) => s === 'measured').map(([k]) => (k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')),
    ...readdirSync(new URL('data/nights/', ROOT)).filter((d) => /^[0-9]+$/.test(d)).map((d) => 'data/nights/' + d + '/verdict.json')];
  const vs = files.flatMap((f) => JSON.parse(read(f)).verdicts);
  return { held: vs.filter((v) => v.pass).length + ' of ' + vs.length, tests: String(files.length),
    failed: String(vs.filter((v) => !v.pass && v.kind === 'prediction').length), red: String(vs.filter((v) => !v.pass && v.kind !== 'prediction').length) };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/tally.mjs');
if (isMain) {
  const t = tally();
  console.log('sealed rules held ' + t.held + ' across ' + t.tests + ' tests · ' + t.failed + ' predictions failed · ' + t.red + ' properties red');
  if (process.argv.includes('--write')) {
    let html = read('index.html');
    for (const [k, v] of Object.entries(t)) html = html.replace(new RegExp('(data-tally="' + k + '">)[^<]*(<)'), '$1' + v + '$2');
    for (const k of ['held', 'failed']) html = html.replace(new RegExp('(data-paper="' + k + '">)[^<]*(<)'), '$1' + t[k] + '$2');   // the white paper's own totals
    html = html.replace(/(all twelve organs, )[0-9]+ of [0-9]+( sealed rules held)/, '$1' + t.held + '$2');   // the meta description
    writeFileSync(new URL('index.html', ROOT), html);
    console.log('wrote the tally into index.html');
  }
}
