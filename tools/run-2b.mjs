#!/usr/bin/env node
// tools/run-2b.mjs — organ 2b end to end, unattended, in the sealed order. Ask qwen2.5:14b every one of the 1,200
// sessions (resumable; the other local models are unloaded first, so the 14B has the memory), commit the answers ALONE,
// measure, commit the record, prove the order from git, judge, then commit the verdict with the page regenerated from it
// and every test passing, and push. Any step that fails stops it, and nothing past the last good step is pushed.
// It keeps clear of the nightly receipt: no git step starts between 02:15 and 03:30.
//   node tools/run-2b.mjs        (hours on a laptop processor; safe to stop and start again)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(ROOT + p, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stop = (why) => { console.log('STOPPED · ' + why + ' — nothing further committed or pushed'); process.exit(1); };
const step = (args) => { console.log('· node ' + args.join(' ')); const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }); if (r.status !== 0) stop('node ' + args.join(' ') + ' exited ' + r.status); };
const SIGN = '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

async function clear() {   // the nightly job commits at 02:30; do not share the index with it
  for (;;) { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); if (m < 135 || m >= 210) return; console.log('waiting · the nightly receipt runs about now'); await sleep(5 * 60 * 1000); }
}
async function git(...args) {
  await clear();
  for (let k = 0; k < 10; k++) {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    if (r.status === 0) return r.stdout;
    if (!/index\.lock/.test(r.stderr)) stop('git ' + args[0] + ': ' + r.stderr.trim());
    await sleep(30000);
  }
  stop('git ' + args[0] + ': the index stayed locked');
}
const ollama = (path, body) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: 11434, path, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
  });
  req.on('error', () => resolve(null));
  req.end(body ? JSON.stringify(body) : undefined);
});

// 1 · ask, with the memory to do it
const ps = await ollama('/api/ps');
if (!ps) stop('LOCAL MODEL DOWN — bring up Ollama (localhost:11434); no cloud fallback');
for (const m of ps.models || []) if (m.name !== 'qwen2.5:14b') { console.log('· unloading ' + m.name + ' so the 14B has the memory'); await ollama('/api/generate', { model: m.name, keep_alive: 0 }); }
step(['tools/ask-llm-2b.mjs']);
const answers = JSON.parse(read('data/organ-2b/llm-answers.json'));
if (answers.calls.length !== 1200) stop(answers.calls.length + ' of 1,200 sessions answered');

// 2 · the answers, committed alone, before anything scores them
await git('add', 'data/organ-2b/llm-answers.json');
await git('commit', '-q', '-m', 'organ 2b: the 14B’s 1,200 answers, committed alone before they are scored' + SIGN);
// 3 · measured, committed; the order proved from git
step(['tools/measure-2b.mjs']);
await git('add', 'data/organ-2b/record.json');
await git('commit', '-q', '-m', 'organ 2b measured' + SIGN);
step(['tools/order.mjs', '--organ', '2b']);
// 4 · judged by the sealed rules (a failed prediction is kept; a red property stops it here, for a person to read)
step(['tools/judge-2b.mjs', '--write']);
const organs = JSON.parse(read('data/organs.json')); organs['2b'] = 'measured';
writeFileSync(ROOT + 'data/organs.json', JSON.stringify(organs, null, 1) + '\n');
step(['tools/tally.mjs', '--write']); step(['tools/geo.mjs', '--write']); step(['tools/csp.mjs']);
step(['--test', ...readdirSync(ROOT + 'test').filter((f) => f.endsWith('.test.mjs')).map((f) => 'test/' + f)]);   // the whole suite, as npm test runs it
const failed = JSON.parse(read('data/organ-2b/verdict.json')).verdicts.filter((v) => !v.pass).map((v) => v.id);
await git('add', 'data/organ-2b/verdict.json', 'data/organs.json', 'index.html', 'llms.txt', 'README.md', 'robots.txt', 'sitemap.xml');
await git('commit', '-q', '-m', 'organ 2b judged: ' + (failed.length ? failed.join(', ') + ' failed as sealed, kept' : 'every rule held as sealed') + '; the page says what the record says' + SIGN);
await git('-c', 'credential.helper=', '-c', 'credential.helper=store', 'push', '-q', 'origin', 'main');
console.log('DONE · organ 2b measured, judged and pushed' + (failed.length ? ' (' + failed.join(', ') + ' failed, kept)' : ''));
