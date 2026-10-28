// numbers.test.mjs — every number the page's static text prints is a number some committed record holds, at the precision
// printed (a percentage counted as a fraction too) — or it is listed below with the reason it is not. A new figure written
// into the page that no record backs fails here until it is backed or explained. (The header and paper tallies are left
// out: test/page.test.mjs sums them from every verdict.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** numbers the page may print that no record holds as a value — each with its reason */
const EXPLAINED = {
  '46': 'part of a commit hash (46a2a14) in the receipt’s git order',
  '22.6': 'the 14B’s median 22,587 ms, in seconds — tested in “organ 2’s result, in words”',
  '77.0': 'August–October delivered 77.0–79.4% (0.770089) — tested in organ 10’s section test',
  '3.5': 'August’s over-claim, 0.0347 in points — tested in organ 10’s section test',
  '5.9': 'September’s over-claim, 0.0591 in points — tested in organ 10’s section test',
  '36': 'the sum of organ 11b’s refused tampers (12 + 12 + 12) — tested in organ 11’s section test',
  '2,048': 'the genome’s size limit, a constant in src/genome.mjs (MAX_BYTES)',
  '128': 'the signature’s length in hex: Ed25519 signatures are 64 bytes',
  '1,000': 'a label in the cost calculator (“per 1,000 records”)',
  '0.0054': 'organ 1’s worst half-history drift, the maximum of differences — tested in the record-numbers test',
  '10.24432': 'the UCI dataset’s DOI (10.24432/C5F88Q), in the references',
  '143': 'Radiology volume 143, in the Hanley & McNeil reference',
  '2,400': 'the size of each synthetic domain (seed-library), 720 of them held out',
  '4,096': 'the context window tools/ask-llm.mjs gave each model (num_ctx)',
  '6,392': 'the single-bit changes organ 13’s two messages allow, 8 × (445 + 354) — tested in organ 13’s section test',
};

function recordValues() {
  const vals = new Set(), files = [];
  const walk = (x) => { if (typeof x === 'number') vals.add(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk);
    else if (typeof x === 'string') for (const m of x.matchAll(/(?<![0-9a-f.])-?\d+(?:\.\d+)?(?![0-9a-f])/g)) vals.add(Number(m[0])); };
  const dir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) dir(p); else if (p.endsWith('.json')) files.push(p); } };
  dir(join(ROOT, 'data'));
  for (const f of files) walk(JSON.parse(readFileSync(f, 'utf8')));
  return [...vals];
}

test('every number the page prints is held by a committed record, or explained', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const text = html.slice(html.indexOf('<body>'), html.indexOf('<script type="module">'))
    .replace(/<span data-(tally|paper)="[a-z]+">[^<]*<\/span>/g, ' ').replace(/<pre>[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&');
  const V = recordValues();
  assert.ok(V.length > 1000, 'the records were read');
  const near = (c, dp) => V.some((v) => Math.abs(v - c) <= 0.5 * 10 ** -dp + 1e-12);
  const unbacked = new Set();
  for (const m of text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(%)?/g)) {
    const raw = m[1], s = raw.replace(/,/g, ''), n = Number(s), dp = (s.split('.')[1] || '').length;
    if (/^(19|20)\d\d$/.test(raw) || (Number.isInteger(n) && n <= 24) || EXPLAINED[raw]) continue;   // years and small counts
    if (near(n, dp) || (m[2] && near(n / 100, dp + 2))) continue;
    unbacked.add(raw + (m[2] || '') + '  …' + text.slice(Math.max(0, m.index - 50), m.index + 20).replace(/\s+/g, ' ') + '…');
  }
  assert.deepEqual([...unbacked], [], 'printed, but held by no record and not explained');
  for (const k of Object.keys(EXPLAINED)) assert.ok(text.includes(k), 'an explanation for a number the page no longer prints: ' + k);
});
