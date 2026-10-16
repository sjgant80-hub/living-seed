// tools/sample.mjs — organ 2's head-to-head, defined once: which held-out shop sessions are asked, which training
// sessions are shown as examples, the exact prompts, and how a reply is read. Pinned by the organ-2 seal, so none of it
// can move after a single model has answered.
import { rng } from '../vendor/seed-library/seedlib.mjs';

export const MODELS = ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.2:1b'];   // largest first; the last is used for the dry run

export const FEATURES_TEXT = [
  'Administrative: number of account-management pages visited',
  'Administrative_Duration: seconds spent on them',
  'Informational: number of information pages visited',
  'Informational_Duration: seconds spent on them',
  'ProductRelated: number of product pages visited',
  'ProductRelated_Duration: seconds spent on them',
  'BounceRates: average bounce rate of the pages visited (0 to 1)',
  'ExitRates: average exit rate of the pages visited (0 to 1)',
  'PageValues: average value of the pages visited before a transaction',
  'SpecialDay: closeness of the visit to a special day such as Valentine\x27s Day (0 to 1)',
];

/** Draw k rows from a list without replacement, in a seeded order. */
function draw(rows, k, seed) {
  const r = rng(seed), xs = rows.slice();
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs.slice(0, k);
}

/** The held-out sessions every contestant is graded on: 100 that ended in a purchase and 200 that did not, drawn
 *  with seed 2026, then put in one seeded order (so no contestant sees the buyers in a run). */
export function sampleOf(shop) {
  const yes = shop.heldRows.filter((i) => shop.y[i] === 1), no = shop.heldRows.filter((i) => shop.y[i] === 0);
  return draw([...draw(yes, 100, 2026), ...draw(no, 200, 2027)], 300, 2028);
}

/** The 24 training sessions shown in the few-shot condition: 12 purchases and 12 not, seed 7, in a seeded order. */
export function examplesOf(shop) {
  const yes = shop.trainRows.filter((i) => shop.y[i] === 1), no = shop.trainRows.filter((i) => shop.y[i] === 0);
  return draw([...draw(yes, 12, 7), ...draw(no, 12, 8)], 24, 9).map((i) => ({ line: caseLine(shop, i), bought: shop.y[i] === 1 }));
}

/** One session as the models read it: every feature by name with its value. */
export const caseLine = (shop, i) => shop.features.map((f) => f + '=' + shop.cols[f][i]).join(', ');

const HEAD = 'You are predicting whether a visit to an online shop ends in a purchase. The data are real sessions on one retail website (the UCI Online Shoppers Purchasing Intention dataset). Each session is described by:\n';

/** The exact prompt for a condition ('zero' or 'few'), a case line and the examples. The examples come first and the
 *  case last, so every few-shot prompt shares one long prefix. */
export function promptFor(condition, line, examples) {
  const shots = condition === 'few'
    ? '\nHere are 24 past sessions from the same website and whether each ended in a purchase:\n' + examples.map((e) => e.line + ' -> ' + (e.bought ? 'purchase' : 'no purchase')).join('\n') + '\n'
    : '';
  return HEAD + FEATURES_TEXT.map((t) => '- ' + t).join('\n') + '\n' + shots + '\nSession: ' + line + '\nWhat is the probability, from 0 to 100, that this session ends in a purchase? Reply with one number only.';
}

/** A reply as a probability in [0, 1]: the first number in it, if it lies in 0…100 — or null when there is none. The
 *  measurement scores a null as a coin (0.5) and counts it, so an unreadable reply costs the model, never the organ. */
export function parseProbability(reply) {
  const m = /-?\d+(?:\.\d+)?/.exec(String(reply));
  const v = m ? Number(m[0]) : NaN;
  return v >= 0 && v <= 100 ? Math.round(v * 1e4) / 1e6 : null;
}
