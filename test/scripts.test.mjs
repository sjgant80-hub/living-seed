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
