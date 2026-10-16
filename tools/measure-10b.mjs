#!/usr/bin/env node
// tools/measure-10b.mjs — organ 10's self-audit, second attempt. Organ 10's audit had one 200-answer window: too slow for
// a collapse (57 wrong after the reversal) and too blunt to notice the real shop organ delivering 76.5–79.4% against its
// claim of 82.9% — so it went on over-claiming. This attempt audits at three scales sharing the same δ (src/align.mjs
// CHECKS): a 50-answer window that stands a collapse down, and 400- and 1,600-answer windows that, when an organ delivers
// less than it claims by more than chance, lower its claim to what it delivered — and it keeps answering, honestly.
// The same genome, the same three streams, run by organ 10's own code (tools/measure-10.mjs). Deterministic:
// node tools/measure-10b.mjs [--check] → data/organ-10b/record.json. Sealed first (tools/seal-10b.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as A from '../src/align.mjs';
import { GENOME, DATA, MONTH, LIVE, FLIP, substrate, streams } from './measure-10.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const sum = (life) => ({ answered: life.answered, right: life.right, wrong: life.wrong, acts: life.acts, events: life.events, final: life.final, head: life.head, chain: A.verifyChain(life.ledger).ok });

export async function measure() {
  const sub = substrate(), s = streams(), on = { checks: A.CHECKS }, off = { audit: false };
  const shop = { audited: await A.life(GENOME, sub, s.shop, on), blind: await A.life(GENOME, sub, s.shop, off) };
  const calm = await A.life(GENOME, sub, s.calm, on);
  const flip = { audited: await A.life(GENOME, sub, s.flip, on), organ10: await A.life(GENOME, sub, s.flip), blind: await A.life(GENOME, sub, s.flip, off) };

  // the claim in force at each case, read from the ledger's claim acts (the first is written before any case)
  const claimIn = (life) => { const cs = life.ledger.filter((e) => e.act.kind === 'claim' && e.act.domain === 'shopper'); return (k) => cs.filter((e) => (e.act.at === undefined ? -1 : e.act.at) <= k).pop().act.accuracy; };
  const months = (life) => { const claim = claimIn(life); return LIVE.map((m) => {
    const ks = s.shop.map((c, k) => (MONTH[c.row] === m ? k : -1)).filter((k) => k >= 0), ans = life.ledger.filter((e) => e.act.kind === 'answer' && ks.includes(e.act.at));
    const right = ans.filter((e) => e.act.label === DATA.shopper.y[s.shop[e.act.at].row]).length, delivered = ans.length ? Math.round((right / ans.length) * 1e6) / 1e6 : 0;
    return { month: m, cases: ks.length, answered: ans.length, right, delivered, claimAtEnd: claim(ks[ks.length - 1]), over: Math.round((claim(ks[ks.length - 1]) - delivered) * 1e6) / 1e6 };
  }); };
  const wrongAfter = (life) => life.ledger.filter((e) => e.act.kind === 'answer' && e.act.at >= s.flipAt && e.act.label !== s.flip[e.act.at].truth).length;

  const replay = await A.life(GENOME, substrate(), streams().shop, on);
  const last = [...shop.audited.ledger].reverse().find((e) => e.act.kind === 'claim' && e.act.domain === 'shopper').act;
  const st = { live: { shopper: { organism: last.organism, claim: last.accuracy } }, down: new Set() };
  const tries = [
    { what: 'lower its claim citing an audit that shows no shortfall', act: { kind: 'claim', domain: 'shopper', accuracy: last.accuracy - 0.05, audit: { n: 400, right: 400, delta: A.AUDIT.delta / 3 } } },
    { what: 'raise its claim back above what it measured', act: { kind: 'claim', domain: 'shopper', accuracy: Math.min(1, last.accuracy + 0.05) } },
  ];
  return {
    kind: 'living-seed.organ-10b.record', v: 1, checks: A.CHECKS, delta: A.AUDIT.delta,
    reversal: { domain: FLIP, at: s.flipAt, cases: s.flip.length },
    shop: { audited: sum(shop.audited), blind: sum(shop.blind), months: { audited: months(shop.audited), blind: months(shop.blind) } },
    calm: sum(calm),
    flip: { audited: sum(flip.audited), organ10: sum(flip.organ10), blind: sum(flip.blind), wrongAfter: { audited: wrongAfter(flip.audited), organ10: wrongAfter(flip.organ10), blind: wrongAfter(flip.blind) } },
    replay: { identical: replay.head === shop.audited.head, head: replay.head },
    unproven: tries.map((t) => { const l = A.licensed(t.act, st); return { what: t.what, refused: !l.ok, why: l.why || null }; }),
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/measure-10b.mjs');
if (isMain) {
  const text = JSON.stringify(await measure(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = read('data/organ-10b/record.json');
    if (committed !== text) { console.log('RECORD MISMATCH · committed ' + sha256Hex(committed).slice(0, 16) + ' vs re-run ' + sha256Hex(text).slice(0, 16)); process.exit(1); }
    console.log('RECORD REPRODUCED · ' + sha256Hex(text).slice(0, 16));
  } else {
    mkdirSync(new URL('data/organ-10b/', ROOT), { recursive: true });
    writeFileSync(new URL('data/organ-10b/record.json', ROOT), text);
    console.log('wrote data/organ-10b/record.json · ' + sha256Hex(text).slice(0, 16));
  }
}
