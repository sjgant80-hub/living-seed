#!/usr/bin/env node
// tools/receipt-b.mjs — check a receipt (b) from two devices, independently of either: both signatures over the same
// receipt, the two sides' records agreeing message for message (each side's hash of what it sent equals the other's hash
// of what it received, nothing refused), and each device's organism re-derived here from the real sessions its half
// holds (organ 11's devices) — so a receipt from devices that did not grow the real organism does not check.
//   node tools/receipt-b.mjs <receipt.json>   → CHECKS ✓ or ✗ with every reason
import { readFileSync } from 'node:fs';
import { verify } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';
import { open } from '../src/genome.mjs';
import { germinate, stable } from '../src/germinate.mjs';
import { GENOME } from './measure-10.mjs';
import { months, device } from './measure-11.mjs';

/** → { ok, reasons: [why each check failed] } */
export async function check(receipt) {
  const why = [];
  try {
    const { sigs, ...core } = receipt;
    if (core.kind !== 'living-seed.receipt-b' || core.v !== 1) return { ok: false, reasons: ['not a receipt (b)'] };
    if (core.genome !== (await open(GENOME)).id) why.push('it names a genome that is not the origin');
    const d = core.devices;
    if (!Array.isArray(d) || d.length !== 2 || d[0].side !== 0 || d[1].side !== 1) return { ok: false, reasons: ['it does not hold two devices, sides 0 and 1'] };
    if (d[0].pub === d[1].pub) why.push('both devices carry one key');
    for (const x of d) if (!sigs || !(await verify(x.pub, sigs[x.pub], utf8(stable(core))))) why.push('device ' + (x.side + 1) + '’s signature does not verify over this receipt');
    const same = d[0].sentHash === d[1].gotHash && d[1].sentHash === d[0].gotHash, clean = d.every((x) => x.refused === 0);
    if (!same) why.push('what one side sent is not what the other received');
    if (!clean) why.push('a device refused a message');
    if (core.consistent !== (same && clean)) why.push('it calls itself ' + (core.consistent ? 'consistent' : 'inconsistent') + ', which the record does not bear out');
    for (const x of d) {
      const g = await germinate(GENOME, device(x.side, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') }));
      if (!g.ok || g.organism.id !== x.organism) why.push('device ' + (x.side + 1) + '’s organism is not the one its half of the sessions grows');
    }
  } catch { return { ok: false, reasons: ['the receipt could not be read'] }; }
  return { ok: why.length === 0, reasons: why };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/receipt-b.mjs');
if (isMain) {
  const f = process.argv[2];
  if (!f) { console.log('usage: node tools/receipt-b.mjs <receipt.json>'); process.exit(2); }
  const r = await check(JSON.parse(readFileSync(f, 'utf8')));
  console.log(r.ok ? 'CHECKS ✓ — two devices, both signed, every message agreed, each grew the real organism' : 'CHECKS ✗ — ' + r.reasons.join('; '));
  process.exit(r.ok ? 0 : 1);
}
