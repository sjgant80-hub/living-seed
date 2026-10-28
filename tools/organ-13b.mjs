// tools/organ-13b.mjs — the fingerprint made to travel, shared by organ 13b's measurement and the page's tab. Organ 13's
// fingerprint named every case it asked exactly, and three of the four domains are drawn with Math.log and Math.cos, which
// two engines may round differently in the last digit. So this one is taken in two parts:
//   the shop     — the real sessions, read from a file: the same bits in every engine, so their receipts must match exactly
//   the others   — what each answer says (its label, score, threshold and the rules that fired), not the case's last digits
// Loads in a browser and in Node alike.
import { roundTrip } from '../src/system.mjs';
import { caseOf } from '../src/germinate.mjs';
import { digestOf } from '../vendor/fall-kit-core/node.mjs';

export const SHOP_CASES = 100, OTHER_CASES = 25;

/** The first 100 held-out shop sessions, and the first 25 held-out cases of each other domain the device holds. */
export const travelCases = (data) => Object.fromEntries(Object.keys(data).sort().map((d) => [d, data[d].heldRows.slice(0, d === 'shopper' ? SHOP_CASES : OTHER_CASES).map((i) => caseOf(data[d], i))]));

/** Ask every case through the grown system; → { organism, roster, shop, others, digest } */
export async function travel(system, cases) {
  const shop = [], others = [];
  for (const d of Object.keys(cases).sort()) for (const x of cases[d]) {
    const t = await roundTrip(system, d, x), r = t.answer && t.answer.receipt;
    if (d === 'shopper') shop.push({ outcome: t.outcome, receipt: r ? r.receiptHash : null });
    else others.push({ organ: d, outcome: t.outcome, said: r ? { label: r.label, score: r.score, threshold: r.threshold, fired: r.fired } : null });
  }
  const part = (xs) => ({ asked: xs.length, verified: xs.filter((x) => x.outcome === 'verified').length, digest: digestOf(xs) });
  const core = { organism: system.organism.id, roster: digestOf(system.roster), shop: part(shop).digest, others: part(others).digest };
  return { organism: core.organism, roster: core.roster, shop: part(shop), others: part(others), digest: digestOf(core) };
}
