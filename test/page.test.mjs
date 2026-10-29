// page.test.mjs — the live page is gated too. Kernel tests cannot see a typo in index.html; these can:
// its script parses, every name it imports exists, every element it touches and every link it makes is on the page, every
// colour token it uses is defined, the five devices it builds are the five the record measured (same organisms, by id),
// and every number its words print is the number the committed record holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { germinate } from '../src/germinate.mjs';
import { DOMAIN_IDS, loadDomain } from '../vendor/seed-library/domains.mjs';
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { tally as tallyOf, nights as nightsOf, nightWords, render as renderTally, PAPER, words2b } from '../tools/tally.mjs';

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
  const nights = readdirSync(new URL('../data/nights/', import.meta.url)).filter((d) => /^[0-9]+$/.test(d) && existsSync(new URL('../data/nights/' + d + '/verdict.json', import.meta.url))).map((d) => 'data/nights/' + d + '/verdict.json');   // receipt (a), night by night (judged nights)
  const vs = [...Object.entries(organs).filter(([, s]) => s === 'measured').map(([k]) => (k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')), ...nights].flatMap((f) => JSON.parse(read(f)).verdicts);
  const tests = Object.values(organs).filter((s) => s === 'measured').length + nights.length;
  const tally = Object.fromEntries([...html.matchAll(/data-tally="([a-z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.equal(tally.held, vs.filter((v) => v.pass).length + ' of ' + vs.length);
  assert.equal(tally.tests, String(tests));
  assert.equal(tally.failed, String(vs.filter((v) => !v.pass && v.kind === 'prediction').length));
  assert.equal(tally.red, String(vs.filter((v) => !v.pass && v.kind !== 'prediction').length));
  const paper = Object.fromEntries([...html.matchAll(/data-paper="([a-z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(paper, { held: tally.held, failed: tally.failed }, 'the white paper says the same');
  assert.ok(html.includes('all fifteen organs, ' + tally.held + ' sealed rules held'), 'and so does the description search engines read');
  // each row of the paper's organ table says what that organ's own verdicts say
  const cell = Object.fromEntries([...html.matchAll(/data-held="([0-9]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  const of = (k) => { const v = JSON.parse(read(k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')).verdicts; return v.filter((x) => x.pass).length + ' of ' + v.length; };
  assert.deepEqual(Object.keys(PAPER).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15]);
  assert.deepEqual(Object.values(PAPER).flat().sort(), Object.keys(organs).sort(), 'every sealed organ is counted in exactly one row');
  for (const [n, ks] of Object.entries(PAPER)) assert.equal(cell[n], ks.filter((k) => organs[k] === 'measured').map(of).join(' · '), 'organ ' + n + ' in the paper');
  const nv = nightsOf().map((x) => JSON.parse(read('data/nights/' + x.n + '/verdict.json')).verdicts).flat();
  assert.equal(cell[12], nv.filter((x) => x.pass).length + ' of ' + nv.length + ' over ' + nightsOf().length + ' nights', 'organ 12 in the paper: every night');
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

test('organ 10’s section prints the numbers its two records hold', () => {
  const sec = html.slice(html.indexOf('<section id="align"'), html.indexOf('</section>', html.indexOf('<section id="align"')));
  const t = JSON.parse(read('data/organ-10/record.json')), b = JSON.parse(read('data/organ-10b/record.json'));
  const gb = (x) => Number(x).toLocaleString('en-GB'), pc = (x) => (Math.round(x * 1000) / 10).toFixed(1) + '%', has = (s, what) => assert.ok(sec.includes(s), what + ': ' + s);
  has('all <b>' + (t.unproven.length + b.unproven.length) + '</b> attempts to act unproven were refused', 'the unproven acts');
  assert.ok([...t.unproven, ...b.unproven].every((u) => u.refused));
  has('Of <b>' + t.tamper.tried + '</b> acts', 'tampers tried');
  has('<b>' + 4 * t.tamper.tried + ' of ' + 4 * t.tamper.tried + '</b> were caught', 'tampers caught');
  assert.ok(Object.values(t.tamper.caught).every((c) => c === t.tamper.tried));
  const re = b.shop.audited.events.find((e) => e.kind === 'reclaim'), m = b.shop.months.audited;
  has('measured <b>' + re.from.toFixed(3) + '</b> on June–July', 'the first claim');
  has(m.slice(0, 3).map((x) => pc(x.delivered)).join(', '), 'August to October delivered');
  has('After ' + gb(re.window) + ' answers', 'the window that was sure');
  has('to <b>' + re.to.toFixed(3) + '</b>', 'the lowered claim');
  has('November delivered ' + m[3].delivered.toFixed(3), 'November');
  has(gb(b.shop.audited.right) + ' of ' + gb(b.shop.audited.answered) + ' right', 'the same answers');
  assert.equal(b.shop.audited.right, b.shop.blind.right);
  const d = b.flip.audited.events.find((e) => e.kind === 'stand-down');
  has('at case ' + b.reversal.at, 'the reversal point');
  has('<b>' + (d.at - b.reversal.at) + ' cases</b> later', 'how fast');
  has('It got ' + b.flip.wrongAfter.audited + ' wrong, against ' + b.flip.wrongAfter.blind, 'wrong after the reversal');
  has('slow: ' + t.flip.wrongAfter.audited + ' wrong', 'organ 10’s slowness');
  const d10 = t.flip.audited.events.find((e) => e.kind === 'stand-down');
  has('stood down ' + (d10.at - b.reversal.at) + ' cases after the reversal', 'the T5 truth from the record’s events');
  has('claiming ' + (t.shop.audited.final.live.shopper * 100).toFixed(1) + '%', 'organ 10 kept claiming');
  const aso = t.shop.months.audited.slice(0, 3).map((x) => (x.right / x.answered) * 100);
  has('the shop delivered ' + Math.min(...aso).toFixed(1) + '–' + Math.max(...aso).toFixed(1) + '%', 'what it delivered meanwhile');
  const overs = b.shop.months.blind.slice(0, 3).map((x) => x.over * 100);
  has('over-claimed by ' + Math.min(...overs).toFixed(1) + '–' + Math.max(...overs).toFixed(1) + ' points', 'August–October over-claim');
});

test('organ 11’s section prints the numbers its two records hold', () => {
  const sec = html.slice(html.indexOf('<section id="season"'), html.indexOf('</section>', html.indexOf('<section id="season"')));
  const r = JSON.parse(read('data/organ-11/record.json')), b = JSON.parse(read('data/organ-11b/record.json'));
  const has = (s, what) => assert.ok(sec.includes(s), what + ': ' + s), f3 = (x) => x.toFixed(3);
  has('<span id="o-mem">' + r.memory.bytes.toLocaleString('en-GB') + '</span> bytes', 'the memory’s size');
  const by = (d) => r.improve.organs.find((o) => o.domain === d);
  has('<b>' + f3(by('shopper').from) + ' → ' + f3(by('shopper').to) + '</b>', 'the shop organ adopted');
  has('crop, ' + f3(by('crop').from) + ' → ' + f3(by('crop').to), 'crop adopted');
  assert.ok(!by('triage').adopted && !by('water').adopted, 'triage and water kept');
  const refused = ['trainingLabel', 'heldLabel', 'livedFeature'].reduce((a, k) => a + b[k].filter((x) => !x.woke).length, 0), tried = ['trainingLabel', 'heldLabel', 'livedFeature'].reduce((a, k) => a + b[k].length, 0);
  has('<b>' + refused + ' of ' + tried + '</b> real changes', 'the memory refusals');
  assert.equal(refused, tried);
  has('A claimed ' + f3(r.liveOn.child.final.live.shopper) + ' and delivered ' + f3(r.liveOn.child.accuracy), 'A’s honest claim');
  has('B claimed ' + f3(r.spread.child.final.live.shopper) + ' and delivered ' + f3(r.spread.child.accuracy), 'B’s honest claim');
  has('AUC <b>' + f3(r.liveOn.child.auc) + '</b> against its parent’s <b>' + f3(r.liveOn.parent.auc) + '</b>', 'A’s November–December');
  has(f3(r.spread.child.auc) + ' against ' + f3(r.spread.origin.auc) + ' at B', 'B’s November–December');
  assert.ok(r.spread.organs.every((o) => o.state === 'live'), 'every organ live on B');
});

test('organ 14’s section prints the numbers its record holds', () => {
  const sec = html.slice(html.indexOf('<section id="substrate"'), html.indexOf('</section>', html.indexOf('<section id="substrate"')));
  const r = JSON.parse(read('data/organ-14/record.json')), gb = (x) => x.toLocaleString('en-GB');
  const v = Object.fromEntries([...sec.matchAll(/data-14="([a-z0-9]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.equal(v.organs, String(r.live.length));
  assert.equal(v.cases, gb(r.totalCases));
  assert.equal(v.wasm, String(r.wasm.bytes));
  assert.equal(v.f32, gb(r.substrates.f32.sameLabel) + ' of ' + gb(r.substrates.f32.cases));
  assert.ok(r.substrates.int.sameScore === r.totalCases && r.substrates.wasm.sameScore === r.totalCases && r.wasm.valid === true, 'the record backs the three-engine claim');
});

test('organ 15’s section prints the numbers its record holds, and names each failed rule as failed', () => {
  const sec = html.slice(html.indexOf('<section id="homeostasis"'), html.indexOf('</section>', html.indexOf('<section id="homeostasis"')));
  const r = JSON.parse(read('data/organ-15/record.json')), f3 = (x) => x.toFixed(3);
  const v = Object.fromEntries([...sec.matchAll(/data-15="([a-zA-Z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(v, {
    naiveAdopt: String(r.naive.adoptions), homeAdopt: String(r.homeostatic.adoptions), origin: f3(r.origin), naiveFinal: f3(r.naive.finalAuc), homeFinal: f3(r.homeostatic.finalAuc),
    naiveHarm: r.naive.harmful + ' of ' + r.naive.adoptions, homeHarm: r.homeostatic.harmful + ' of ' + r.homeostatic.adoptions,
  });
  for (const x of JSON.parse(read('data/organ-15/verdict.json')).verdicts) assert.match(sec, x.pass ? new RegExp('\\(' + x.id + ' held\\)') : new RegExp('\\(' + x.id + ',[^)]*failed and is kept\\)'), x.id);
  assert.ok(r.origin > r.naive.finalAuc && r.origin > r.homeostatic.finalAuc, 'the record backs “neither beat doing nothing”');
  assert.ok(sec.includes('a gap of ' + f3(r.naive.finalAuc - r.homeostatic.finalAuc) + ' on one stretch'), 'the gap it says is untested is the record’s');
  const margin = /export const MARGIN = ([0-9.]+);/.exec(read('src/evolve.mjs'))[1];
  assert.ok(sec.includes('by more than ' + margin + '. Nature’s rule asks more') && /z: 0\b/.test(read('tools/measure-15.mjs')), 'greedy’s margin is the gate’s own (src/evolve.mjs), and greedy ran with no noise term');
  assert.ok(sec.includes('twice the noise') && JSON.parse(read('data/nights/1/prereg.json')).z === 2, 'and nature’s rule is two standard errors, as every night sealed it');
  const n1 = (l) => l.perNight[0];
  assert.ok(n1(r.naive).adopted && n1(r.homeostatic).adopted && f3(n1(r.naive).after) === '0.777' && f3(n1(r.homeostatic).after) === '0.777', 'and “on night 1 both fell to 0.777”');
  assert.ok(r.homeostatic.perNight.slice(1).every((p) => !p.adopted) && r.naive.perNight[4].adopted && f3(r.naive.perNight[4].after) === '0.789', 'and “the dead band refused every later change; greedy climbed back on night 5”');
});

test('organ 13’s section prints the numbers its record holds', () => {
  const sec = html.slice(html.indexOf('<section id="system"'), html.indexOf('</section>', html.indexOf('<section id="system"')));
  const r = JSON.parse(read('data/organ-13/record.json')), gb = (x) => x.toLocaleString('en-GB');
  const v13 = Object.fromEntries([...sec.matchAll(/data-13="([a-z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  const { bits, resolved, travel, ...v } = v13;
  const all = Object.values(r.asked), held = all.reduce((a, x) => a + x.held, 0), verified = all.reduce((a, x) => a + (x.outcomes.verified || 0), 0);
  const kept = (t, bad) => t.positions - (t.reasons[bad] || 0);
  assert.deepEqual(v, {
    bytes: String(r.genome.bytes), asked: gb(held), verified: gb(verified), net: String(r.offline.networkTouched), shop: String(r.asked.shopper.auc),
    genome: gb(kept(r.tamper.genome, 'GREW')) + ' of ' + gb(r.tamper.genome.positions), roster: gb(kept(r.tamper.roster, 'READ')) + ' of ' + gb(r.tamper.roster.positions),
    ask: (r.tamper.ask.outcomes.refused || 0) + ' of ' + r.tamper.ask.bits, answer: (r.tamper.answer.outcomes.refused || 0) + ' of ' + r.tamper.answer.bits,
    liar: (r.lies.liar.outcomes.failed || 0) + ' of ' + r.lies.liar.told, stale: (r.lies.stale.outcomes.failed || 0) + ' of ' + r.lies.stale.told, child: String(r.bred.shopAuc.child),
  });
  assert.ok(sec.includes('(' + r.bred.shopAuc.origin + ' and ' + r.bred.shopAuc.evolved + ')'), 'the parents’ shop organs');
  assert.ok(sec.includes('followed all ' + r.offline.imports.files + ' and found no network module') && r.offline.imports.network.length === 0, 'the files the system loads');
  assert.ok(sec.includes(r.tamper.ask.bits + ' + ' + r.tamper.answer.bits + ' changes, out of the ' + gb(8 * (r.tamper.ask.bits + r.tamper.answer.bits))), 'the bits tried, of all');
  const b = JSON.parse(read('data/organ-13b/record.json')), c = JSON.parse(read('data/organ-13c/record.json')), bt = JSON.parse(read('data/organ-13b/tab.json'));
  assert.equal(v13.bits, gb(b.doors.ask.bits) + ' + ' + gb(b.doors.answer.bits));
  assert.ok(b.doors.ask.outcomes.refused === b.doors.ask.bits && b.doors.answer.outcomes.refused === b.doors.answer.bits, 'every bit refused, as the page says');
  assert.equal(v13.resolved, String(c.loader.resolutions));
  assert.ok(c.loader.outside.length === 0 && c.loader.files === r.offline.imports.files, 'nothing outside, the same files');
  assert.ok(sec.includes('it read ' + b.imports.outside.length + ' strings on export lines'), 'the scan’s false names, counted');
  assert.equal(v13.travel, bt.seconds.toFixed(1));
  assert.ok(sec.includes('first ' + b.travel.shopCases + ' real shop sessions') && sec.includes('for ' + b.travel.others.asked + ' synthetic cases'), 'what the travelling fingerprint takes');
  assert.ok(sec.includes('the first ' + r.portable.cases + ' held-out cases'), 'what the tab asks');
});

test('organ 12’s section prints night 1 as its record holds it', () => {
  const sec = html.slice(html.indexOf('<section id="receipts"'), html.indexOf('</section>', html.indexOf('<section id="receipts"')));
  const r = JSON.parse(read('data/nights/1/record.json')), shop = r.organs.find((o) => o.domain === 'shopper');
  assert.ok(sec.includes('<span id="n1-oct">' + shop.from.toFixed(3) + ' → ' + shop.to.toFixed(3) + '</span>'), 'night 1 on October');
  assert.ok(sec.includes('<span id="n1-final">' + r.before.finalAuc.toFixed(3) + ' → ' + r.after.finalAuc.toFixed(3) + '</span>'), 'night 1 on November–December');
  assert.ok(r.after.finalAuc < r.before.finalAuc, 'it got worse — and the page says so');
});

test('organ 2c prints what its record holds: the organ against three classical models, failure kept', () => {
  const r = JSON.parse(read('data/organ-2c/record.json')), v = JSON.parse(read('data/organ-2c/verdict.json')).verdicts, m = r.models, f3 = (x) => x.toFixed(3);
  const sec = html.slice(html.indexOf('<h3 id="classical">'), html.indexOf('</section>', html.indexOf('<h3 id="classical">')));
  const has = (s, what) => assert.ok(sec.includes(s), what + ': ' + s);
  has('<b>' + f3(m.boosted.auc) + '</b> against the organ’s <b>' + f3(r.organ.auc) + '</b>, from ' + m.boosted.numbers.toLocaleString('en-GB') + ' numbers against ' + r.organ.numbers, 'the closest');
  has('Logistic regression scored ' + f3(m.logistic.auc) + ' and PageValues alone ' + f3(m.pageValues.auc), 'the other two');
  has('(' + f3(m.pageValues.fitRowsAuc) + '–' + f3(m.boosted.fitRowsAuc) + ')', 'the months they were fitted to');
  assert.ok(Object.values(m).every((x) => x.fitRowsAuc >= m.pageValues.fitRowsAuc && x.fitRowsAuc <= m.boosted.fitRowsAuc), 'that range spans all three');
  assert.ok(Object.values(m).every((x) => !(x.organLeadLow95 > 0) && !(x.modelLeadLow95 > 0)), 'none beyond the noise, either way — as the words say');
  has('only ' + r.organ.distinctScores + ' different values', 'the bands');
  assert.equal(v.find((x) => x.id === 'D2').pass, false); has('(D2) failed', 'the failure, kept');
  for (const [k, name] of [['pageValues', 'PageValues alone'], ['logistic', 'Logistic regression'], ['boosted', 'Boosted trees']]) has('<tr><td>' + name + '</td><td class="num">' + m[k].numbers.toLocaleString('en-GB') + '</td><td class="num">' + f3(m[k].fitRowsAuc) + '</td><td class="num"><b>' + f3(m[k].auc) + '</b></td>', name + ' row');
  for (const s of ['boosted trees scored 0.824, the organ 0.815, PageValues alone 0.807 and logistic regression 0.801', 'boosted trees with 2,001 numbers scored 0.824, logistic regression 0.801 and PageValues alone 0.807']) assert.ok(html.includes(s), 'the brochure and the FAQ: ' + s);
  assert.ok([m.boosted.auc, r.organ.auc, m.pageValues.auc, m.logistic.auc].map(f3).join() === '0.824,0.815,0.807,0.801' && m.boosted.numbers === 2001, 'and those words are the record’s');
});

test('organ 2b’s words come from its record and verdict, whichever way it falls', () => {
  assert.match(words2b().block, /being asked/);
  const rec = (organ, model, low, unreadable = 0) => ({ margin: 0.02, fresh: { cases: 1200, organ, model, lead: organ - model, leadLow95: low, unreadable }, together: { cases: 1500, organ: 0.82, model: 0.8 } });
  const ver = (c2, c3, c4) => [{ id: 'C1', pass: true }, { id: 'C2', pass: c2 }, { id: 'C3', pass: c3 }, { id: 'C4', pass: c4 }];
  const win = words2b(rec(0.83, 0.8, 0.01), ver(true, true, true)), tie = words2b(rec(0.82, 0.81, -0.01, 3), ver(false, true, false)), worse = words2b(rec(0.78, 0.82, -0.06), ver(false, false, true));
  const has = (s, part) => assert.ok(s.includes(part), part + ' in: ' + s);
  has(win.block, 'a win beyond the noise (C2 held)'); has(win.what, 'a win, lead 0.030, bound 0.010'); has(win.block, 'C4 held');
  has(tie.block, 'still a tie, but the organ is not worse by more than 0.02 (C2 failed and is kept; C3 held)'); has(tie.block, 'C4 failed'); assert.match(tie.block, /3 of the 14B’s replies could not be read/); assert.match(tie.what, /still a tie/);
  assert.match(worse.block, /C2 and C3 failed/); assert.ok(!/could not be read/.test(win.block));
  assert.ok(!/NaN|undefined/.test(win.block + tie.block + worse.block + win.what + tie.what));
  const o = JSON.parse(read('data/organs.json'));
  assert.ok(html.includes(o['2b'] === 'measured' ? 'Organ 2b settled it' : 'Organ 2b settles it'), 'the page says the state organs.json says');
});

test('receipt (a) says what every judged night says, and the nightly job keeps it so', () => {
  assert.equal(renderTally(html), html, 'node tools/tally.mjs --write has been run since the last night was judged');
  const ns = nightsOf(), w = nightWords(ns), sec = html.slice(html.indexOf('<section id="receipts"'), html.indexOf('</section>', html.indexOf('<section id="receipts"')));
  assert.ok(ns.length >= 2 && ns.every((x, i) => x.n === i + 1), 'the nights are numbered 1, 2, … with none missing');
  assert.ok(sec.includes('<table data-nights-count="' + ns.length + '">'), 'one row a night, and the page fetches each one');
  for (const x of ns) assert.ok(sec.includes('<tr><td>' + x.n + '</td>'), 'night ' + x.n + ' has its row');
  for (const k of ['short', 'what', 'since']) assert.ok(html.includes('data-nights="' + k + '">' + w[k] + '<'), k);
  assert.match(w.since, ns.slice(1).some((x) => x.adopted.length) ? /adopted a change/ : /adopted nothing/, 'the stricter gate’s nights, as their records hold them');
  for (const stale of ['owner’s decision', 'night 1 measured, and it got worse', 'the first night</h4>', 'four times']) assert.ok(!html.includes(stale), 'no stale words: ' + stale);
  assert.ok(sec.includes('<code>tools/night-nightly.ps1</code>') && read('tools/night-nightly.ps1').includes('node tools/tally.mjs --write'), 'the job the page names rewrites the page');
});

test('organ 2’s result, in words, is the record’s', () => {
  const words = html.slice(html.indexOf('<p class="answer" id="h2h-words">'), html.indexOf('</p>', html.indexOf('id="h2h-words"')));
  const c = JSON.parse(read('data/organ-2/record.json')).contest, m = c.models, f3 = (x) => (Math.round(x * 1000) / 1000).toString();
  const has = (s, what) => assert.ok(words.includes(s), what + ': ' + s);
  has('from ' + c.organ.seedBytes + ' bytes of seed', 'the seed');
  has('AUC <b>' + c.organ.auc + '</b>', 'the organ');
  has('the 14B scored ' + f3(m['qwen2.5:14b · zero'].auc), '14B cold');
  has('the 7B ' + f3(m['qwen2.5:7b · zero'].auc), '7B cold');
  assert.ok(m['llama3.2:1b · zero'].unreadable === c.sample.cases && m['llama3.2:1b · few'].unreadable === c.sample.cases && m['llama3.2:1b · zero'].auc === 0.5, 'the 1B never answered readably');
  has('any of its ' + c.sample.cases + ' cases', '1B unreadable');
  has('the 14B reached <b>' + f3(m['qwen2.5:14b · few'].auc) + '</b>', '14B with examples');
  has('lead over that is ' + f3(m['qwen2.5:14b · few'].organLead), 'the lead');
  has('lower bound is −' + f3(-m['qwen2.5:14b · few'].organLeadLow95), 'its bound');
  assert.ok(m['qwen2.5:14b · few'].organLeadLow95 < 0, 'a tie: the bound crosses zero');
  has((Math.round(c.organ.timing.perAnswerUs * 10) / 10) + ' µs', 'the organ’s speed');
  has((Math.round(m['qwen2.5:14b · zero'].medianMs / 100) / 10) + ' s', 'the 14B’s speed');
  const v = JSON.parse(read('data/organ-2/verdict.json')).verdicts;
  assert.equal(v.find((x) => x.id === 'B6').pass, false, 'B6 failed — and the words say so');
  has('(B6) failed', 'B6');
  const calls = JSON.parse(read('data/organ-2/llm-answers.json')).calls, longest = Math.max(...calls.map((x) => x.promptTokens));
  assert.ok(longest < 4096 && html.includes('the longest, with 24 examples, was ' + longest.toLocaleString('en-GB') + ' tokens'), 'every prompt fitted the window');
});

test('the brochure and the questions print what the records hold', () => {
  const r9 = JSON.parse(read('data/organ-9/record.json')), r3 = JSON.parse(read('data/organ-3/record.json')), b = JSON.parse(read('data/organ-10b/record.json')), c = JSON.parse(read('data/organ-2/record.json')).contest;
  const re = b.shop.audited.events.find((e) => e.kind === 'reclaim');
  assert.ok(html.includes('0 of ' + r9.organ9.flood.tried.toLocaleString('en-GB') + ' forgeries were admitted') && r9.organ9.flood.admitted === 0, 'forgeries');
  assert.ok(html.includes('came down from ' + re.from.toFixed(3) + ' to ' + re.to.toFixed(3) + ' in November'), 'the claim that came down');
  assert.ok(html.includes('the 14B took a median ' + (Math.round(c.models['qwen2.5:14b · zero'].medianMs / 100) / 10) + ' s per answer, and the organ ' + (Math.round(c.organ.timing.perAnswerUs * 10) / 10) + ' µs'), 'the speeds');
  const vs = [...Object.entries(JSON.parse(read('data/organs.json'))).filter(([, s]) => s === 'measured').map(([k]) => (k === '1' ? 'data/verdict.json' : 'data/organ-' + k + '/verdict.json')), ...nightsOf().map((x) => 'data/nights/' + x.n + '/verdict.json')].flatMap((f) => JSON.parse(read(f)).verdicts);
  const red = vs.filter((v) => !v.pass && v.kind !== 'prediction').length;
  assert.ok(html.includes(vs.filter((v) => !v.pass && v.kind === 'prediction').length + '</span> predictions failed and ' + ['no', 'one', 'two', 'three', 'four'][red] + (red === 1 ? ' property is' : ' properties are') + ' red'), 'what did not work, every night counted');
  assert.equal(tallyOf().failed, String(vs.filter((v) => !v.pass && v.kind === 'prediction').length));
  assert.ok(html.includes('0 of ' + r3.input.attacksTried.toLocaleString('en-GB') + ' attacks got past the gate') && r3.input.breached === 0, 'organ 3’s attacks');
});

test('the structured data says what the page says: its FAQ is the visible FAQ, word for word', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  const sec = html.slice(html.indexOf('<section id="faq"'), html.indexOf('</section>', html.indexOf('<section id="faq"')));
  const visible = [...sec.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => [plain(m[1]), plain(m[2])]);
  const schema = ld['@graph'].find((x) => x['@type'] === 'FAQPage').mainEntity.map((q) => [q.name, q.acceptedAnswer.text]);
  assert.ok(visible.length >= 10);
  assert.deepEqual(schema, visible);
  const t = Object.fromEntries([...html.matchAll(/data-tally="([a-z]+)">([^<]+)</g)].map((m) => [m[1], m[2]]));
  assert.ok(ld['@graph'].find((x) => x['@type'] === 'SoftwareApplication').description.includes(t.held + ' sealed rules held'), 'and its count is the header’s');
  const llms = read('llms.txt'), robots = read('robots.txt');
  assert.ok(llms.includes(t.held + ' sealed rules held') && llms.includes('Organ 12, the three receipts'), 'llms.txt is current');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.ok(robots.includes('User-agent: ' + bot), bot + ' let in by name');
});

test('every commit the receipt links to exists in this repository’s history', () => {
  const shas = [...new Set([...html.matchAll(/commit\/([0-9a-f]{40})/g)].map((m) => m[1]))];
  assert.equal(shas.length, 4);
  for (const s of shas) execFileSync('git', ['cat-file', '-e', s + '^{commit}'], { cwd: new URL('..', import.meta.url) });
});
