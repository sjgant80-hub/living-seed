#!/usr/bin/env node
// tools/ask-llm-2b.mjs — organ 2b's contestant: qwen2.5:14b shown organ 2's 24 examples, asked about 1,200 new held-out
// sessions, exactly as organ 2 asked it (temperature 0, seed 7, a 4,096-token window, 8 tokens to reply). Writes
// data/organ-2b/llm-answers.json as it goes; resumable (done calls are kept). Local model only — never a cloud one.
//   node tools/ask-llm-2b.mjs [--dry-run]    (--dry-run: two TRAIN cases through llama3.2:1b, printed, nothing written)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { loadDomain } from '../vendor/seed-library/domains.mjs';
import { examplesOf, caseLine, promptFor, parseProbability, FEATURES_TEXT } from './sample.mjs';
import { MODEL, CONDITION, sampleOf2b } from './sample-2b.mjs';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('data/organ-2b/llm-answers.json', ROOT);
const shop = loadDomain('shopper', { shopperCsv: readFileSync(new URL('data/online_shoppers_intention.csv', ROOT), 'utf8') });
const ollama = (path, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 11434, path, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { reject(new Error('not JSON from ' + path)); } });
  });
  req.on('error', reject);
  req.end(body ? JSON.stringify(body) : undefined);
});
async function ask(model, prompt) {
  const t0 = Date.now(), r = await ollama('/api/generate', { model, prompt, stream: false, keep_alive: '30m', options: { temperature: 0, seed: 7, num_ctx: 4096, num_predict: 8 } });
  return { reply: String(r.response || ''), wallMs: Date.now() - t0, promptTokens: r.prompt_eval_count || 0 };
}

const tags = await ollama('/api/tags').catch(() => null);
if (!tags || !Array.isArray(tags.models)) { console.log('LOCAL MODEL DOWN — bring up Ollama (localhost:11434). Nothing asked; no cloud fallback.'); process.exit(2); }
const digest = Object.fromEntries(tags.models.map((m) => [m.name, m.digest])), bytes = Object.fromEntries(tags.models.map((m) => [m.name, m.size]));
const ex = examplesOf(shop);
if (process.argv.includes('--dry-run')) {
  for (const i of shop.trainRows.slice(0, 2)) { const a = await ask('llama3.2:1b', promptFor(CONDITION, caseLine(shop, i), ex)); console.log('train row', i, '→', JSON.stringify(a.reply), a.promptTokens + ' prompt tokens'); }
  process.exit(0);
}
if (!digest[MODEL]) { console.log('MISSING MODEL ' + MODEL); process.exit(2); }
mkdirSync(new URL('data/organ-2b/', ROOT), { recursive: true });
const doc = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { kind: 'living-seed.organ-2b.llm-answers', v: 1, features: FEATURES_TEXT, model: { name: MODEL, digest: digest[MODEL], bytes: bytes[MODEL] }, calls: [] };
if (doc.model.digest !== digest[MODEL]) { console.log('REFUSED · the model on this machine is not the one these answers began with'); process.exit(1); }
const done = new Set(doc.calls.map((c) => c.row));
for (const row of sampleOf2b(shop)) {
  if (done.has(row)) continue;
  const prompt = promptFor(CONDITION, caseLine(shop, row), ex), a = await ask(MODEL, prompt);
  doc.calls.push({ row, prompt: sha256Hex(prompt).slice(0, 16), reply: a.reply, p: parseProbability(a.reply), wallMs: a.wallMs, promptTokens: a.promptTokens });
  writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  if (doc.calls.length % 50 === 0) console.log(doc.calls.length + ' of 1,200 asked');
}
console.log('wrote data/organ-2b/llm-answers.json · ' + doc.calls.length + ' calls');
