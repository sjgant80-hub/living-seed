#!/usr/bin/env node
// tools/ask-llm.mjs — organ 2's contestants: local language models asked the shop question directly.
//
//   node tools/ask-llm.mjs                 → asks every model, both conditions, every sampled case; writes
//                                            data/organ-2/llm-answers.json as it goes (resumable: done calls are kept)
//   node tools/ask-llm.mjs --dry-run       → two TRAIN cases through the smallest model, printed, nothing written —
//                                            exercises the plumbing without looking at a single held-out case
//
// Each model gets the same held-out shop sessions the organ is graded on (the sample in sample.mjs), in two
// conditions: zero-shot (what the data is, then the case) and 24-shot (the same, plus 24 past sessions from the
// training history with their outcomes — the same data the organ could learn from, as much of it as a prompt holds
// comfortably). It is asked for a probability from 0 to 100. Temperature 0, a fixed seed, a fixed context; the reply,
// its parse, the prompt's SHA-256, the model's digest and the wall time are all kept, so the judge needs no model to
// re-score, and anyone with Ollama and the same digests can ask again. Runs only on the local model — never a cloud one.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { sha256Hex, sha256Bytes, utf8 } from '../vendor/seed-library/sha256.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { fromSeed } from '../vendor/keys/keys.mjs';
import { seal } from '../src/genome.mjs';
import { germinate, answer, caseOf } from '../src/germinate.mjs';
import { MODELS, FEATURES_TEXT, sampleOf, examplesOf, caseLine, promptFor, parseProbability } from './sample.mjs';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/organ-2/llm-answers.json', ROOT);
const shop = loadDomain('shopper', { shopperCsv: readFileSync(new URL('data/online_shoppers_intention.csv', ROOT), 'utf8') });

function ollama(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { reject(new Error('not JSON from ' + path)); } });
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function ask(model, prompt) {
  const t0 = Date.now();
  const r = await ollama('/api/generate', { model, prompt, stream: false, keep_alive: '30m', options: { temperature: 0, seed: 7, num_ctx: 4096, num_predict: 8 } });
  return { reply: String(r.response || ''), wallMs: Date.now() - t0, promptTokens: r.prompt_eval_count || 0 };
}

const tags = await ollama('/api/tags').catch(() => null);
if (!tags || !Array.isArray(tags.models)) { console.log('LOCAL MODEL DOWN — bring up Ollama (localhost:11434). Nothing asked; no cloud fallback.'); process.exit(2); }
const digest = Object.fromEntries(tags.models.map((m) => [m.name, m.digest]));
const bytes = Object.fromEntries(tags.models.map((m) => [m.name, m.size]));
for (const m of MODELS) if (!digest[m]) { console.log('MISSING MODEL ' + m + ' — ollama pull ' + m); process.exit(2); }

if (process.argv.includes('--dry-run')) {
  const ex = examplesOf(shop);
  for (const i of shop.trainRows.slice(0, 2)) for (const cond of ['zero', 'few']) {
    const p = promptFor(cond, caseLine(shop, i), ex);
    const a = await ask(MODELS[MODELS.length - 1], p);
    console.log(cond, 'train row', i, '→', JSON.stringify(a.reply), '→', parseProbability(a.reply), a.wallMs + ' ms', a.promptTokens + ' prompt tokens');
  }
  process.exit(0);
}

mkdirSync(new URL('data/organ-2/', ROOT), { recursive: true });
const sample = sampleOf(shop), ex = examplesOf(shop);
const doc = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { kind: 'living-seed.organ-2.llm-answers', v: 1, features: FEATURES_TEXT, models: {}, calls: [] };
const done = new Set(doc.calls.map((c) => c.model + '|' + c.condition + '|' + c.row));
for (const model of MODELS) {
  doc.models[model] = { digest: digest[model], bytes: bytes[model] };
  for (const condition of ['zero', 'few']) {
    for (const row of sample) {
      if (done.has(model + '|' + condition + '|' + row)) continue;
      const prompt = promptFor(condition, caseLine(shop, row), ex);
      const a = await ask(model, prompt);
      doc.calls.push({ model, condition, row, prompt: sha256Hex(prompt).slice(0, 16), reply: a.reply, p: parseProbability(a.reply), wallMs: a.wallMs, promptTokens: a.promptTokens });
      writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
    }
    const mine = doc.calls.filter((c) => c.model === model && c.condition === condition);
    console.log(model + ' · ' + condition + ' · ' + mine.length + ' calls · median ' + mine.map((c) => c.wallMs).sort((a, b) => a - b)[mine.length >> 1] + ' ms');
  }
}
// the organ on the same box, same cases: 1,000 passes over the sample, timed together (a single answer is too fast to time)
const run = JSON.parse(readFileSync(new URL('data/seed-library-run.json', ROOT), 'utf8'));
const maker = await fromSeed(sha256Bytes(utf8('living-seed/maker/origin')));
const g = await seal({ name: 'origin', parents: [], gate: { auc: 0.6 }, organs: run.library.seeds.map((s) => s.seed) }, maker);
const org = (await germinate(g.text, { name: 'reference', data: { shopper: shop } })).organism;
const cases = sample.map((i) => caseOf(shop, i));
const t0 = process.hrtime.bigint();
for (let k = 0; k < 1000; k++) for (const x of cases) answer(org, 'shopper', x);
const ns = Number(process.hrtime.bigint() - t0);
doc.organTiming = { answers: 1000 * cases.length, totalMs: Math.round(ns / 1e6), perAnswerUs: Math.round(ns / 1e3 / (1000 * cases.length) * 1000) / 1000, box: os.cpus()[0].model.trim() + ' · ' + os.cpus().length + ' threads · ' + Math.round(os.totalmem() / 2 ** 30) + ' GB RAM · no GPU in use' };
writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log('wrote data/organ-2/llm-answers.json · ' + doc.calls.length + ' calls · organ ' + doc.organTiming.perAnswerUs + ' µs per answer');
