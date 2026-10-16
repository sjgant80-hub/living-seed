// page.test.mjs — the live page is gated too. Kernel tests cannot see a typo in index.html; these can:
// its script parses, every name it imports exists, every element it touches and every link it makes is on the page, every
// colour token it uses is defined, the five devices it builds are the five the record measured (same organisms, by id),
// and every number its words print is the number the committed record holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { germinate } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const script = scripts[0];
const record = JSON.parse(read('data/record.json'));

test('the page has one module script, and it parses', () => {
  assert.equal(scripts.length, 1);
  const dir = mkdtempSync(join(tmpdir(), 'ls-page-'));
  try {
    const f = join(dir, 'page.mjs');
    writeFileSync(f, script);
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every name the page imports is exported by that module — the page runs the gated kernels, not a copy', async () => {
  const imports = [...script.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.\/[^']+)'/g)];
  assert.ok(imports.length >= 6, 'the page imports its kernels');
  assert.ok(imports.some(([, , p]) => p === './src/genome.mjs') && imports.some(([, , p]) => p === './src/germinate.mjs'));
  for (const [, names, path] of imports) {
    const mod = await import(new URL('../' + path.slice(2), import.meta.url));
    for (const raw of names.split(',').map((x) => x.trim()).filter(Boolean)) assert.ok(raw.split(/\s+as\s+/)[0].trim() in mod, `${path} does not export ${raw}`);
  }
});

test('every element the script reaches for is on the page; no id is defined twice', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), [], 'duplicate ids');
  const wanted = new Set([...script.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  assert.ok(wanted.size > 25);
  assert.deepEqual([...wanted].filter((x) => !ids.includes(x)), [], 'the script reaches for an element that is not there');
  // and every control on the page is wired: each button id is named by the script (by $('id') or in a list it wires)
  const named = new Set([...script.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
  const buttons = [...html.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(buttons.filter((b) => !named.has(b)), [], 'a dead button');
  const lists = [...script.matchAll(/const [A-Z_]+ = \[([^\]]*)\];\n/g)].flatMap((m) => [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1])).filter((x) => /^[a-z]-/.test(x));
  assert.deepEqual(lists.filter((x) => !ids.includes(x)), [], 'a wired list names an element that is not there');
});

test('every in-page link lands, every colour token is defined, every form control has a label', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anchors = [...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]);
  assert.ok(anchors.length >= 9);
  assert.deepEqual(anchors.filter((a) => !ids.has(a)), [], 'a link to nowhere');
  const css = (/<style>([\s\S]*?)<\/style>/.exec(html) || [])[1];
  const root = (/:root\{([^}]*)\}/.exec(css) || [])[1];
  const defined = new Set([...root.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
  const used = new Set([...html.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((v) => !defined.has(v)), [], 'an undefined CSS variable');
  for (const scheme of html.matchAll(/:root(?::not\(\[data-theme="dark"\]\)|\[data-theme="dark"\])\{([^}]*)\}/g)) {
    const again = new Set([...scheme[1].matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    assert.deepEqual([...defined].filter((v) => !again.has(v) && !['--mono', '--sans'].includes(v)), [], 'a theme that leaves a colour undefined');
  }
  // static controls: each input/select/textarea has a <label for> or sits inside a <label>
  for (const m of html.matchAll(/<(input|select|textarea)\s[^>]*id="([^"]+)"/g)) {
    const id = m[2], at = m.index;
    const wrapped = html.lastIndexOf('<label', at) > html.lastIndexOf('</label>', at);
    assert.ok(html.includes('for="' + id + '"') || wrapped, id + ' has no label');
  }
});

test('the five devices the page builds are the five the record measured — the same organisms, by fingerprint', async () => {
  const src = (/function substrates\(data\) \{[\s\S]*?\n\}\n/.exec(script) || [])[0];
  assert.ok(src, 'the page builds its devices in one function');
  const substrates = new Function('rng', 'DOMAIN_IDS', src + 'return substrates;')(rng, DOMAIN_IDS);
  const data = Object.fromEntries(DOMAIN_IDS.map((d) => [d, loadDomain(d, { shopperCsv: read('data/online_shoppers_intention.csv') })]));
  const subs = substrates(data);
  assert.deepEqual(Object.keys(subs).sort(), Object.keys(record.organisms).sort());
  for (const [name, d] of Object.entries(subs)) {
    const r = await germinate(record.genome.text, { name, data: d });
    assert.equal(r.organism.id, record.organisms[name].id, name);
  }
  const names = [...script.matchAll(/\{ name: '([a-z-]+)', label:/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), Object.keys(record.organisms).sort(), 'one button per measured device');
});

test('every number the page’s words print is the number the committed record holds', () => {
  const text = html.slice(0, html.indexOf('<script type="module">'));
  const org = (s, d) => record.organisms[s].organs.find((x) => x.domain === d);
  for (const s of ['reference', 'device-a', 'device-b']) for (const d of DOMAIN_IDS) assert.ok(text.includes('>' + org(s, d).heldAuc + '<'), s + '/' + d + ' ' + org(s, d).heldAuc);
  assert.ok(text.includes('>' + org('shuffled-shopper', 'shopper').heldAuc + ' · cut<'));
  assert.ok(text.includes(record.genome.bytes + '-byte') && text.includes('>' + record.genome.bytes + ' B<'));
  assert.ok(text.includes(record.tamper.refused + '/' + record.tamper.positions) && text.includes(record.tamper.refused + ' of ' + record.tamper.positions));
  const shop = org('reference', 'shopper');
  assert.ok(text.includes('AUC ' + shop.heldAuc.toFixed(3)) && text.includes((shop.heldAcc * 100).toFixed(1) + '%'));
  assert.ok(text.includes((org('shuffled-shopper', 'shopper').heldAcc * 100).toFixed(1) + '%'), 'the cut organ’s misleading accuracy');
  const drift = Math.max(...['device-a', 'device-b'].flatMap((s) => DOMAIN_IDS.map((d) => Math.abs(org(s, d).heldAuc - org('reference', d).heldAuc))));
  assert.ok(text.includes(drift.toFixed(4)), 'the worst drift on half the history');
  const v = JSON.parse(read('data/verdict.json')).verdicts;
  assert.ok(text.includes(v.filter((x) => x.pass).length + ' / ' + v.length + ' sealed rules held') && text.includes(v.filter((x) => x.pass).length + ' of ' + v.length));
  const gate = JSON.parse(read('data/prereg.json'));
  assert.ok(text.includes('the ' + Object.keys(gate.files).length + ' files'));
});

test('the header’s tally is the sum of every committed verdict, failures included', () => {
  const organs = JSON.parse(read('data/organs.json'));
  const vs = Object.entries(organs).filter(([, s]) => s === 'measured')
    .flatMap(([k]) => JSON.parse(read(k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')).verdicts);
  const tests = Object.values(organs).filter((s) => s === 'measured').length;
  const tally = Object.fromEntries([...html.matchAll(/data-tally="([a-z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.equal(tally.held, vs.filter((v) => v.pass).length + ' of ' + vs.length);
  assert.equal(tally.tests, String(tests));
  assert.equal(tally.failed, String(vs.filter((v) => !v.pass && v.kind === 'prediction').length));
  assert.equal(tally.red, String(vs.filter((v) => !v.pass && v.kind !== 'prediction').length));
});

test('organ 9’s section prints the numbers its two records hold', () => {
  const sec = html.slice(html.indexOf('<section id="immune"'), html.indexOf('</section>', html.indexOf('<section id="immune"')));
  const r = JSON.parse(read('data/organ-9/record.json')), b = JSON.parse(read('data/organ-9b/record.json'));
  const gb = (x) => Number(x).toLocaleString('en-GB'), has = (s, what) => assert.ok(sec.includes(s), what + ': ' + s);
  has('<b>' + gb(r.organ8.flood.tried) + '</b> forgeries', 'the flood');
  assert.equal(r.organ8.flood.checked, r.organ8.flood.tried, 'organ 8 checked every one');
  has('<b>' + gb(r.organ9.flood.checked) + '</b> (' + Math.round((r.organ9.flood.checked / r.organ8.flood.checked) * 1000) / 10 + '%)', 'organ 9’s checks');
  assert.equal(r.organ9.rounds.slice(-5).reduce((a, x) => a + x.flood.checked, 0), 0, 'none in the last five');
  has(gb(r.organ9.flood.attackerHashes) + ' hashes', 'the attacker’s work');
  has('<b>round ' + r.attack.theftAt + '</b>', 'the theft round');
  assert.equal(r.organ9.thief.everyHonestRevokedBy, r.attack.theftAt);
  assert.equal(r.organ9.thief.toFarm, 0, 'no task went to the thief');
  assert.equal(r.organ9.immune.revokes.filter((e) => e.why === 'proof').map((e) => e.by).join(), 'north', 'north caught the clash');
  has('taken over in round ' + r.attack.takeoverAt, 'the takeover');
  has('claiming ' + r.attack.claim, 'what it claimed');
  assert.equal(b.organ9b.takeover.everyHonestCutBy, r.attack.takeoverAt, 'cut that same round');
  has('sent ' + b.organ9b.takeover.toSouth + ' cases', '9b’s cases to south');
  has('<b>' + r.organ8.takeover.toSouth + '</b> under organ 8', 'organ 8’s');
  has('reached <b>' + gb(r.organ8.immune.memoryMax) + '</b>', 'organ 8’s memory');
  has('peaked at ' + r.organ9.immune.memoryMax, 'organ 9’s memory');
  has('cap of ' + r.cap, 'the cap');
  has('as far as ' + r.calibration.top.drift, 'the single mix’s honest swing');
  assert.equal(r.calibration.limits.drift, 1, 'its limit hit the ceiling');
  has('honest rounds reached ' + b.calibration.top.claims, 'the claims channel');
  has('the takeover reached ' + Math.min(...b.organ9b.immune.cuts.filter((c) => c.of === 'south').map((c) => c.claims)), 'the takeover’s claims drift');
  assert.equal(b.calibration.top.conduct, 1, 'conduct reached 1');
  has('answered ' + r.organ9.tasks.rightCount + ' tasks right against organ 8’s ' + r.organ8.tasks.rightCount, 'the cost');
});

test('every commit the receipt links to exists in this repository’s history', () => {
  const shas = [...new Set([...html.matchAll(/commit\/([0-9a-f]{40})/g)].map((m) => m[1]))];
  assert.equal(shas.length, 4);
  for (const s of shas) execFileSync('git', ['cat-file', '-e', s + '^{commit}'], { cwd: new URL('..', import.meta.url) });
});
