// scripts.test.mjs — the PowerShell scripts the scheduled tasks run are pure ASCII: Windows PowerShell 5.1 reads a script
// without a byte-order mark as ANSI, so a UTF-8 em dash decodes to a byte it takes for a closing smart quote, and every
// string after it breaks. The nightly receipt failed exactly so on its first real run (2026-10-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('every PowerShell script in tools/ is pure ASCII', () => {
  const dir = new URL('../tools/', import.meta.url), ps = readdirSync(dir).filter((f) => f.endsWith('.ps1'));
  assert.ok(ps.length >= 1);
  for (const f of ps) {
    const bytes = readFileSync(new URL(f, dir)), at = bytes.findIndex((b) => b > 0x7f);
    assert.equal(at, -1, f + ' has a non-ASCII byte at ' + at);
  }
});

// A plain YAML scalar ends a mapping value at ': ' and starts a comment at ' #', so a step whose command holds either
// makes the whole workflow fail to load, and no gate runs at all. Organ 2b's grep for '"2b": "measured"' did (2026-10-19).
test('the CI workflow loads: no plain step name or command holds ": " or " #"', () => {
  const lines = readFileSync(new URL('../.github/workflows/gate.yml', import.meta.url), 'utf8').split('\n');
  const plain = lines.map((l, i) => [i + 1, /^\s*(?:- )?(run|name): (?![|>])(.*)$/.exec(l)]).filter(([, m]) => m && !/^["']/.test(m[2]));
  assert.ok(plain.length > 20, 'the steps were read');
  for (const [n, m] of plain) assert.ok(!/: | #/.test(m[2]), 'gate.yml line ' + n + ': a plain ' + m[1] + ' holds ": " or " #" — quote it or use run: |');
  assert.ok(lines.some((l) => /^\s*run: \|$/.test(l)), 'block scalars are read too');
});

// The nightly job is the only writer that runs unattended. A commit pushed from anywhere else since the night before
// made its pushes non-fast-forward, and PowerShell does not stop on a native command's failure, so the night would be
// sealed and judged on this laptop and never reach the public record — silently. It fast-forwards first and throws when
// it cannot, before anything is sealed. Its pushes report whether they landed. A seal that cannot be pushed yet is warned
// about and the night runs on to its receipt: throwing there would leave a sealed night with no record, which CI refuses
// for every night but the last, so the next night would turn the public record red. A receipt that cannot be pushed
// throws (the scheduled task's last result is then not 0), and goes out with the next night's push.
test('the nightly job starts from the public repository, and a push that does not land is never silent', () => {
  const ps = readFileSync(new URL('../tools/night-nightly.ps1', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l));
  const at = (re) => ps.findIndex((l) => re.test(l));
  const pull = at(/^git pull -q --ff-only origin main;\s+if \(\$LASTEXITCODE -ne 0\) \{ throw /), seal = at(/node tools\/night\.mjs seal \$n/), count = at(/^\$n = 1 \+ /);
  assert.ok(pull >= 0, 'it fast-forwards to origin/main, and throws when it cannot');
  assert.ok(pull < count && count < seal, 'before it counts the nights, so the night it seals is the next one the public record lacks');
  assert.match(ps.find((l) => /^\$push = \{/.test(l)), /^\$push = \{ git -c credential\.helper= -c credential\.helper=store push -q origin main \| Out-Null; \$LASTEXITCODE -eq 0 \}\s*$/, 'a push says whether it landed');
  assert.equal(ps.filter((l) => /\bgit\b[^;]*\bpush\b/.test(l)).length, 1, 'every push goes through the checked one');
  assert.equal(ps.filter((l) => /& \$push/.test(l)).length, 2, 'the seal is pushed before the run, and the receipt after the judge');
  const sealPush = at(/git commit -q -m "night \$n sealed - before it runs"; if \(-not \(& \$push\)\) \{ Write-Warning "/);
  const run = at(/^node tools\/night\.mjs run \$n;\s+if \(-not \$\?\) \{ throw /);
  const receiptPush = at(/git commit -q -m "night \$n judged"; if \(-not \(& \$push\)\) \{ throw "/);
  assert.ok(seal < sealPush && sealPush < run && run < receiptPush, 'seal, push the seal (a warning if it cannot land yet), run, then the receipt pushed or a throw');
  assert.ok(!/throw/.test(ps[sealPush]), 'a seal that cannot be pushed yet never stops the night before it runs');
});

// The bar for every build: kernels gated by witness pinned at v0.6, on GitHub's runner. The copy organ 1's seal pinned
// (.witness/witness.mjs) stays byte for byte as sealed; CI judges with the release, cloned at its tag and held to its commit.
test('CI judges the kernels with witness v0.6, cloned at its tag and checked against its commit', () => {
  const y = readFileSync(new URL('../.github/workflows/gate.yml', import.meta.url), 'utf8');
  assert.match(y, /git clone --depth 1 --branch v0\.6 https:\/\/github\.com\/sjgant80-hub\/witness\.git "\$RUNNER_TEMP\/witness" && test "\$\(git -C "\$RUNNER_TEMP\/witness" rev-parse HEAD\)" = f04fe3047e3d49b98c67713befd5b77182afa0d4/);
  assert.match(y, /run: WITNESS="\$RUNNER_TEMP\/witness\/witness\.mjs" node witness-all\.mjs\n/);
  assert.ok(y.indexOf('--branch v0.6') < y.indexOf('node witness-all.mjs'), 'cloned before it judges');
  assert.equal((y.match(/node witness-all\.mjs/g) || []).length, 1, 'and nothing else judges in its place');
});
