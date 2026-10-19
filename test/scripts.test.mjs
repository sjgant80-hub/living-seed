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
