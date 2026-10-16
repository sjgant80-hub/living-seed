// receipt-b.test.mjs — the checker for receipt (b), on receipts made here (no real two-device receipt exists yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../tools/receipt-b.mjs';
import { open } from '../src/genome.mjs';
import { germinate, stable } from '../src/germinate.mjs';
import { generate, sign } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { GENOME } from '../tools/measure-10.mjs';
import { months, device } from '../tools/measure-11.mjs';

async function made(patch = (c) => c) {
  const ids = [];
  for (const side of [0, 1]) ids.push((await germinate(GENOME, device(side, { train: months('Feb', 'Mar', 'May', 'Aug', 'Sep'), held: months('Oct') }))).organism.id);
  const [k0, k1] = [await generate(), await generate()], a = sha256Hex('what 0 sent'), b = sha256Hex('what 1 sent');
  const core = patch({ kind: 'living-seed.receipt-b', v: 1, genome: (await open(GENOME)).id, consistent: true, devices: [
    { side: 0, pub: k0.pub, organism: ids[0], sent: 26, got: 26, refused: 0, answered: 12, sentHash: a, gotHash: b },
    { side: 1, pub: k1.pub, organism: ids[1], sent: 26, got: 26, refused: 0, answered: 12, sentHash: b, gotHash: a }] });
  const text = utf8(stable(core));
  return { ...core, sigs: { [k0.pub]: await sign(k0, text), [k1.pub]: await sign(k1, text) } };
}

test('a receipt from two devices that agree, both signed, each with the real organism, checks', async () => {
  assert.deepEqual(await check(await made()), { ok: true, reasons: [] });
});

test('a receipt checks only if every part of it holds', async () => {
  const r = await made();
  assert.deepEqual((await check({ ...r, devices: [r.devices[0], { ...r.devices[1], gotHash: r.devices[1].sentHash }] })).reasons[0], 'device 1’s signature does not verify over this receipt', 'any change breaks the signatures');
  const disagree = await made((c) => ({ ...c, consistent: false, devices: [c.devices[0], { ...c.devices[1], gotHash: sha256Hex('something else') }] }));
  assert.deepEqual((await check(disagree)).reasons, ['what one side sent is not what the other received']);
  const lied = await made((c) => ({ ...c, devices: [c.devices[0], { ...c.devices[1], gotHash: sha256Hex('something else') }] }));
  assert.deepEqual((await check(lied)).reasons, ['what one side sent is not what the other received', 'it calls itself consistent, which the record does not bear out']);
  const refused = await made((c) => ({ ...c, consistent: false, devices: [c.devices[0], { ...c.devices[1], refused: 1 }] }));
  assert.deepEqual((await check(refused)).reasons, ['a device refused a message']);
  const fake = await made((c) => ({ ...c, devices: [{ ...c.devices[0], organism: 'f'.repeat(16) }, c.devices[1]] }));
  assert.deepEqual((await check(fake)).reasons, ['device 1’s organism is not the one its half of the sessions grows']);
  const other = await made((c) => ({ ...c, genome: '0'.repeat(16) }));
  assert.deepEqual((await check(other)).reasons, ['it names a genome that is not the origin']);
  const one = await made((c) => ({ ...c, devices: [c.devices[0], { ...c.devices[1], pub: c.devices[0].pub }] }));
  assert.ok((await check(one)).reasons.includes('both devices carry one key'));
  assert.deepEqual(await check({ ...r, sigs: {} }), { ok: false, reasons: ['device 1’s signature does not verify over this receipt', 'device 2’s signature does not verify over this receipt'] });
  assert.deepEqual(await check({ ...r, devices: [r.devices[0]] }), { ok: false, reasons: ['it does not hold two devices, sides 0 and 1'] });
  assert.deepEqual(await check({ ...r, kind: 'x' }), { ok: false, reasons: ['not a receipt (b)'] });
  assert.deepEqual(await check(null), { ok: false, reasons: ['the receipt could not be read'] });
});
