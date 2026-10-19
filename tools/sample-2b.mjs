// tools/sample-2b.mjs — organ 2b's cases: 1,200 held-out shop sessions organ 2 never asked (400 that ended in a purchase,
// 800 that did not), drawn with their own seeds from what organ 2's sample left, in one seeded order. Everything else —
// the 24 examples, the prompt, how a reply is read — is organ 2's own (tools/sample.mjs), unchanged.
import { rng } from '../vendor/seed-library/seedlib.mjs';
import { sampleOf } from './sample.mjs';

export const MODEL = 'qwen2.5:14b', CONDITION = 'few', YES = 400, NO = 800;

function draw(rows, k, seed) {
  const r = rng(seed), xs = rows.slice();
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs.slice(0, k);
}

/** the 1,200: none of them in organ 2's 300 */
export function sampleOf2b(shop) {
  const used = new Set(sampleOf(shop)), left = shop.heldRows.filter((i) => !used.has(i));
  const yes = left.filter((i) => shop.y[i] === 1), no = left.filter((i) => shop.y[i] === 0);
  return draw([...draw(yes, YES, 3026), ...draw(no, NO, 3027)], YES + NO, 3028);
}
