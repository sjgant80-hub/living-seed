import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/genome.mjs';
import { encodeSeed, makeSeed } from '../vendor/seed-library/seedlib.mjs';
import { fromSeed, sign } from '../vendor/keys/keys.mjs';
import { sha256Bytes, utf8 as u8, sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';

const run = JSON.parse(readFileSync(new URL('../data/seed-library-run.json', import.meta.url), 'utf8'));
const SEEDS = run.library.seeds.map((s) => s.seed);
const MAKER = await fromSeed(sha256Bytes(u8('living-seed/maker/origin')));
const OTHER = await fromSeed(sha256Bytes(u8('living-seed/maker/other')));
const FIELDS = { name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS };
const ORIGIN = await G.seal(FIELDS, MAKER);
/** sign any body text as MAKER — for genomes the codec would never write, to prove open() refuses them anyway */
const forge = async (bodyText, keys = MAKER) => bodyText + '\nsig ' + (await sign(keys, utf8(bodyText)));

test('seal: the whole organism in a few hundred readable bytes, one line each, signed by its maker', async () => {
  assert.equal(ORIGIN.ok, true);
  const lines = ORIGIN.text.split('\n');
  assert.deepEqual(lines.slice(0, 3), ['◊ life.v1 origin', 'parents -', 'gate auc=0.6']);
  assert.deepEqual(lines.slice(3, 7), SEEDS.map((s) => 'organ ' + s));
  assert.equal(lines[7], 'by ' + MAKER.pub);
  assert.match(lines[8], /^sig [0-9a-f]{128}$/);
  assert.equal(lines.length, 9);
  assert.equal(utf8(ORIGIN.text).length, 496);
  assert.equal(ORIGIN.id, G.idOf(lines.slice(0, 8).join('\n')));
  assert.equal(ORIGIN.id, sha256Hex(lines.slice(0, 8).join('\n')).slice(0, 16));
  // Ed25519 signing is deterministic: the same genome, byte for byte, every time
  assert.equal((await G.seal(FIELDS, MAKER)).text, ORIGIN.text);
  assert.notEqual((await G.seal(FIELDS, OTHER)).text, ORIGIN.text);
  assert.deepEqual(await G.seal(FIELDS, null), { ok: false, why: 'no maker keys' });
  assert.deepEqual(await G.seal(FIELDS, { pub: 7 }), { ok: false, why: 'no maker keys' });
  assert.deepEqual(await G.seal({ ...FIELDS, name: 'Bad' }, MAKER), { ok: false, why: 'the name is lower-case letters, digits and hyphens, at most 32' });
  assert.deepEqual(await G.seal(FIELDS, { pub: MAKER.pub, priv: 'not a key' }), { ok: false, why: 'the genome could not be sealed' });
});

test('open: verify before parse — the maker, the fields and the id come back only from a genome whose seal holds', async () => {
  const o = await G.open(ORIGIN.text);
  assert.equal(o.ok, true);
  assert.equal(o.id, ORIGIN.id);
  assert.deepEqual(o.fields, { name: 'origin', parents: [], gate: { auc: 0.6 }, organs: SEEDS, by: MAKER.pub });
  assert.equal(o.body + '\nsig ' + o.sig, ORIGIN.text);
  // a device can accept only the makers it trusts
  assert.equal((await G.open(ORIGIN.text, { trust: [MAKER.pub] })).ok, true);
  assert.deepEqual(await G.open(ORIGIN.text, { trust: [OTHER.pub] }), { ok: false, why: 'untrusted maker' });
  assert.deepEqual(await G.open(ORIGIN.text, { trust: [] }), { ok: false, why: 'untrusted maker' });
  assert.equal((await G.open(ORIGIN.text, { trust: 'all' })).ok, true, 'a trust that is not a list is no restriction');
  // two parents: a child genome names both
  const child = await G.seal({ ...FIELDS, name: 'child', parents: [ORIGIN.id, 'abcdef0123456789'] }, MAKER);
  const c = await G.open(child.text);
  assert.deepEqual([c.ok, c.fields.parents], [true, [ORIGIN.id, 'abcdef0123456789']]);
  assert.equal(child.text.split('\n')[1], 'parents ' + ORIGIN.id + ',abcdef0123456789');
});

test('one byte changed anywhere in a genome — any position, any line — and it is refused', async () => {
  let refused = 0;
  for (let i = 0; i < ORIGIN.text.length; i++) {
    const c = ORIGIN.text[i];
    const swap = c === 'a' ? 'b' : c === '\n' ? ' ' : c === '0' ? '1' : 'a';
    const t = ORIGIN.text.slice(0, i) + swap + ORIGIN.text.slice(i + 1);
    const o = await G.open(t);
    assert.equal(o.ok, false, 'position ' + i);
    refused++;
  }
  assert.equal(refused, ORIGIN.text.length);
  // signed by a different maker who claims to be the first: the key on the by line does not match the signature
  const swapped = ORIGIN.text.replace('by ' + MAKER.pub, 'by ' + OTHER.pub);
  assert.deepEqual(await G.open(swapped), { ok: false, why: 'signature' });
  // the same body re-signed by another key is a different maker's genome — honest about who made it
  const resigned = await forge(ORIGIN.text.split('\n').slice(0, 7).join('\n') + '\nby ' + OTHER.pub, OTHER);
  assert.deepEqual([(await G.open(resigned)).ok, (await G.open(resigned)).fields.by], [true, OTHER.pub]);
});

test('open refuses, in words: not a genome, too large, not signed, a seal that does not hold, a body written any other way', async () => {
  const lines = ORIGIN.text.split('\n'), bodyText = lines.slice(0, 8).join('\n');
  for (const junk of [null, undefined, 7, {}, '', 'hello', '◊ life.v2 origin', '◊ seed.v1 shopper 21 g:16.2.14 abc']) assert.deepEqual(await G.open(junk), { ok: false, why: 'not a genome' }, String(junk));
  assert.deepEqual(await G.open('◊ life.v1 ' + 'x'.repeat(G.MAX_BYTES)), { ok: false, why: 'too large' });
  assert.equal((await G.open('◊ life.v1 ' + 'x'.repeat(G.MAX_BYTES - 12))).why, 'not signed', 'exactly ' + G.MAX_BYTES + ' bytes is not too large');
  // the smallest genome there is — one organ — opens
  const one = await G.seal({ name: 'one', organs: [SEEDS[1]] }, MAKER);
  assert.deepEqual([(await G.open(one.text)).ok, one.text.split('\n').length], [true, 6]);
  assert.equal((await G.open('◊ life.v1 ' + 'é'.repeat(1020))).why, 'too large', 'bytes, not characters');
  assert.deepEqual(await G.open(bodyText), { ok: false, why: 'not signed' });
  assert.deepEqual(await G.open(bodyText + '\nsig ' + 'a'.repeat(127)), { ok: false, why: 'not signed' });
  assert.deepEqual(await G.open(bodyText + '\nsig ' + 'A'.repeat(128)), { ok: false, why: 'not signed' });
  assert.deepEqual(await G.open(bodyText.replace(/\nby [0-9a-f]+$/, '\nby nobody') + '\nsig ' + lines[8].slice(4)), { ok: false, why: 'not signed' });
  assert.deepEqual(await G.open(bodyText.replace(/\nby [0-9a-f]+$/, '\nsigned ' + MAKER.pub) + '\nsig ' + lines[8].slice(4)), { ok: false, why: 'not signed' });
  assert.deepEqual(await G.open(lines.slice(0, 7).join('\n') + '\nsig ' + lines[8].slice(4)), { ok: false, why: 'not signed' }, 'no by line');
  // signed, but not in the one form the codec writes: refused even though the signature holds
  for (const odd of [
    bodyText.replace('gate auc=0.6', 'gate auc=0.60'),
    bodyText.replace('parents -', 'parents  -'),
    bodyText.replace('organ ◊', 'organ  ◊'),
    bodyText.replace(lines[4], lines[3]),                                  // two organs for one domain
    bodyText.replace(lines[5], lines[5] + ' '),                            // a stray space the ribosome would forgive
    bodyText.replace('◊ life.v1 origin', '◊ life.v1 Origin'),
    bodyText.replace('gate auc=0.6', 'gate auc=0.4'),
    bodyText.replace('parents -', 'parents ' + 'a'.repeat(16) + ',' + 'a'.repeat(16)),
    bodyText.replace('parents -', 'parents ' + 'A'.repeat(16)),
    bodyText.replace('\norgan ', '\nseed '),
    bodyText.replace('gate auc=0.6\n', ''),
    lines.slice(0, 3).join('\n') + '\nby ' + MAKER.pub,                    // no organ at all
    bodyText + '\nby ' + MAKER.pub,                                       // a stray line before the maker
  ]) assert.deepEqual(await G.open(await forge(odd)), { ok: false, why: 'not canonical' }, odd.slice(0, 120));
});

test('body: every field checked, the first wrong one named', () => {
  const b = (f) => G.body({ ...FIELDS, by: MAKER.pub, ...f });
  assert.equal(b({}).ok, true);
  assert.equal(G.body({ name: 'origin', organs: SEEDS, by: MAKER.pub }).text.split('\n').slice(1, 3).join('|'), 'parents -|gate auc=0.6', 'defaults: no parents, the 0.6 gate');
  const why = (f) => b(f).why;
  for (const name of ['', 'A', '1abc', 'a b', 'a'.repeat(33), 7, null]) assert.equal(why({ name }), 'the name is lower-case letters, digits and hyphens, at most 32', String(name));
  assert.equal(b({ name: 'a' + '-0'.repeat(15) + 'x' }).ok, true, 'exactly 32');
  for (const parents of ['x', [1], ['abc'], ['A'.repeat(16)], ['a'.repeat(16), 'b'.repeat(16), 'c'.repeat(16)]]) assert.equal(why({ parents }), 'parents are at most two genome ids', JSON.stringify(parents));
  assert.equal(why({ parents: ['a'.repeat(16), 'a'.repeat(16)] }), 'a parent is named twice');
  for (const gate of [null, {}, { auc: 0.49 }, { auc: 1.01 }, { auc: 0.6555 }, { auc: '0.6' }, { auc: NaN }]) assert.equal(why({ gate }), 'the gate is an AUC from 0.5 to 1, at most three decimals', JSON.stringify(gate));
  for (const organ of [' ' + SEEDS[0], SEEDS[0] + ' ']) assert.equal(why({ organs: [organ] }), 'an organ is not written the one way the ribosome writes it', JSON.stringify(organ));
  for (const organs of [[], Array(9).fill(SEEDS[0]), 'x', null]) assert.equal(why({ organs }), 'a genome carries one to ' + G.MAX_ORGANS + ' organs', JSON.stringify(organs));
  assert.match(why({ organs: ['◊ seed.v1 shopper 21 f:7fdfe22dde6663ead42d 000000000000'] }), /^an organ is not a seed the ribosome reads: /, 'a seed whose own check fails');
  assert.equal(why({ organs: [7] }), 'an organ is not a seed the ribosome reads: not text');
  assert.equal(why({ organs: [SEEDS[0] + '\nby x'] }), 'an organ is not a seed the ribosome reads: not text', 'no line can hide inside an organ');
  assert.equal(why({ organs: [SEEDS[0], SEEDS[0]] }), 'two organs for one domain: shopper');
  for (const by of ['', 'a'.repeat(63), 'A'.repeat(64), 7]) assert.equal(why({ by }), 'the maker is an Ed25519 public key (64 hex)', String(by));
  assert.equal(G.body(null).why, 'the genome could not be read');
  assert.equal(G.body({ get name() { throw new Error('x'); } }).why, 'the genome could not be read');
  // exactly the most organs, eight domains; a domain named any other way is refused
  const eight = Array.from({ length: 8 }, (_, k) => encodeSeed(makeSeed({ domain: 'job-' + k, seed: 1 })));
  assert.equal(b({ organs: eight }).ok, true, 'exactly ' + G.MAX_ORGANS);
  for (const domain of ['Shop', 'ünïcode', 'x'.repeat(33), '‮dir', '1st']) assert.equal(why({ organs: [encodeSeed(makeSeed({ domain, seed: 1 }))] }),
    'an organ names its domain in lower-case letters, digits and hyphens', JSON.stringify(domain));
  assert.equal(why({ organs: [encodeSeed(makeSeed({ domain: 'a b', seed: 1 }))] }), 'an organ is not a seed the ribosome reads: seed must be a whole number ≥ 1', 'a space splits the seed itself');
  // one organ, two parents, the strictest gate: still a genome
  assert.equal(b({ organs: [SEEDS[1]], parents: ['a'.repeat(16), 'b'.repeat(16)], gate: { auc: 1 } }).text.split('\n')[2], 'gate auc=1');
  assert.equal(b({ organs: SEEDS.slice(0, 1) }).text.split('\n').length, 5);
});

test('gateText: a bar from 0.5 to 1 with at most three decimals, written one way', () => {
  assert.deepEqual([0.5, 0.6, 0.65, 0.655, 0.999, 1].map(G.gateText), ['0.5', '0.6', '0.65', '0.655', '0.999', '1']);
  for (const bad of [0.4999, 1.0001, 0.6555, -1, '0.6', null, undefined, NaN, Infinity]) assert.equal(G.gateText(bad), '', String(bad));
  assert.deepEqual([G.TAG, G.MAX_BYTES, G.MAX_ORGANS, G.MAX_PARENTS, G.GATE_AUC], ['◊ life.v1', 2048, 8, 2, 0.6]);
});
