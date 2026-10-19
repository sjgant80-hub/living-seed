// organism.mjs — THE FULL ORGANISM: one life, end to end, every door gated.
//
// Build-order step 11. The organs before this one each proved a part. This one lives a whole life with them:
//
//   seed       — it arrives as a card (organ 5): a picture whose pixels carry a signed genome. Booting reads the card
//                and opens the genome (organ 1) under the device's trust list; a card it cannot read or a maker it does
//                not trust never germinates.
//   live       — germinated on the device's own data (organ 1), it answers through its body (organ 2), every act
//                licensed and chained, its claims following what actually happens (organ 10).
//   remember   — what it lived is kept so it can stop and start again: its genome, every case it was told the truth
//                of, and the head of its ledger, signed with the device's key. Waking lives that memory again and must
//                arrive at the same head: a changed case, a changed byte, a key it does not trust, or different data
//                underneath, and it will not wake.
//   improve    — each live organ is evolved on the device's own labelled history (organ 4, blind to the cases held back)
//                and the gate (organ 3's rule) adopts a candidate only if it beats the organ it would replace, on cases
//                the evolver never saw, by the margin. The device seals a child genome naming its parent.
//   reproduce  — the child travels as a card; the card must give back the very genome it was made from.
//   spread     — another device boots the card under its own trust, germinates the child on its own data, and lives.
//
// Coupling (the mesh and its immune system) is measured in organ 9’s run, which composes organs 1, 2, 3, 8 and 9; the
// self-model in organ 7. Powered by the Konomi architecture, created by Thomas Frumkin.
import { readCard, cardOf } from './card.mjs';
import { open, seal } from './genome.mjs';
import { germinate, stable } from './germinate.mjs';
import { life } from './align.mjs';
import { evolve, blind, MARGIN } from './evolve.mjs';
import { decodeSeed, germinate as express } from '../vendor/seed-library/seedlib.mjs';
import { sign, verify } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';

export const MEMORY = 'living-seed.memory';

/** The standard error of an AUC measured on nPos positive and nNeg negative cases (Hanley & McNeil, 1982). */
export function aucError(a, nPos, nNeg) {
  if (!(nPos > 0 && nNeg > 0 && a >= 0 && a <= 1)) return 1;
  const q1 = a / (2 - a), q2 = (2 * a * a) / (1 + a);
  return Math.sqrt(Math.max(0, (a * (1 - a) + (nPos - 1) * (q1 - a * a) + (nNeg - 1) * (q2 - a * a)) / (nPos * nNeg)));
}
const no = (why) => ({ ok: false, why });

/** Boot from a card: read the genome out of its pixels and open it under the device's trust. → { ok, genome, id, fields } */
export async function boot(cardBytes, opts = {}) {
  const c = await readCard(cardBytes, { trust: opts.trust });   // the card opens its genome itself, under the same trust
  return c.ok ? { ok: true, genome: c.genome, id: c.id, fields: c.fields } : no('the card was refused: ' + c.why);
}

/** The child as a card (organ 5 proves a card gives back the very genome it was made from). → { ok, png } */
export async function reproduce(genomeText) {
  const c = await cardOf(genomeText);
  return c.ok ? { ok: true, png: c.png } : no('no card could be made: ' + c.why);
}

/** Write down what it lived, signed by the device. cases: [{ domain, row, truth }]; head: its ledger's last hash. */
export async function remember(genomeText, cases, head, keys) {
  const core = { kind: MEMORY, v: 1, genome: genomeText, cases: cases.map((c) => [c.domain, c.row, c.truth]), head, by: keys.pub };
  return JSON.stringify({ ...core, sig: await sign(keys, utf8(stable(core))) });
}

/**
 * Wake from a memory: its signature checked against the device's trust (opts.self: the device's own public keys), its
 * genome opened, and its life lived again on the device's data — it must arrive at the head it wrote down.
 * → { ok, genome, cases, life } | a refusal
 */
export async function wake(text, substrate, opts = {}) {
  try {
    const { sig, ...core } = JSON.parse(text);
    if (core.kind !== MEMORY || core.v !== 1 || !Array.isArray(core.cases)) return no('not a memory');
    if (!Array.isArray(opts.self) || !opts.self.includes(core.by)) return no('the memory was not written by this device');
    if (!(await verify(core.by, sig, utf8(stable(core))))) return no('the memory was changed after it was written');
    const p = await open(core.genome, { trust: opts.trust });
    if (!p.ok) return no('its genome was refused: ' + p.why);
    const cases = core.cases.map(([domain, row, truth]) => ({ domain, row, truth }));
    const l = await life(core.genome, substrate, cases, opts.life);
    if (!l.ok || l.head !== core.head) return no('living its memory again does not arrive where it left off — the data under it is not what it lived');
    return { ok: true, genome: core.genome, cases, life: l };
  } catch { return no('the memory could not be read'); }
}

/**
 * Improve, through the gate: each organ live on this device is evolved on blind(its data) (the evolver never sees the
 * held rows), and a champion is adopted only if, grown on this device's data, it beats the organ it would replace on
 * the held rows by more than MARGIN. The device seals the child, naming the parent.
 * opts: { trust, evolve: options for evolve(), margin: the gate's margin (MARGIN), z: when set, a candidate must also beat the
 * organ by z standard errors of the organ's own held-out AUC — a gain larger than the noise in the evidence }.
 * → { ok, child, id, organs: [{ domain, adopted, … }] }
 */
export async function improve(genomeText, substrate, keys, opts = {}) {
  const { margin = MARGIN, z = 0 } = opts;
  const p = await open(genomeText, { trust: opts.trust });
  if (!p.ok) return no('the genome was refused: ' + p.why);
  const g = await germinate(genomeText, substrate);
  if (!g.ok) return no(g.why);
  const recipes = [], organs = [];
  for (const recipe of p.fields.organs) {
    const domain = decodeSeed(recipe).seed.domain, ds = substrate.data[domain], mine = g.organism.organs.find((o) => o.domain === domain);
    if (mine.state !== 'live') { recipes.push(recipe); organs.push({ domain, adopted: false, why: 'it is ' + mine.state + ' here' }); continue; }
    const e = evolve(recipe, blind(ds), opts.evolve);
    const c = e.ok ? express(ds, e.champion) : null;
    const barOn = (auc, rows) => { const pos = rows.filter((i) => ds.y[i] === 1).length; return Math.max(margin, z * aucError(auc, pos, rows.length - pos)); };
    const slices = opts.slices && opts.slices[domain];
    if (slices) {   // the time-fold gate: the candidate must beat the organ on every slice, each judged on its own
      const held = new Set(ds.heldRows);
      if (!slices.length || !slices.every((rows) => rows.length && rows.every((i) => held.has(i)))) { recipes.push(recipe); organs.push({ domain, adopted: false, why: 'a slice holds cases the evolver could have seen' }); continue; }
      const per = slices.map((rows) => { const v = { ...ds, heldRows: rows }, a = express(v, recipe), b = c && c.ok ? express(v, e.champion) : null; return { cases: rows.length, mine: a.heldAuc, candidate: b && b.ok ? b.heldAuc : null, bar: barOn(a.heldAuc, rows) }; });
      const won = per.every((s) => s.candidate !== null && s.candidate - s.mine > s.bar);
      recipes.push(won ? e.champion : recipe);
      organs.push({ domain, adopted: won, from: mine.heldAuc, slices: per, ...(won ? { to: c.heldAuc } : { why: 'the candidate did not beat it on every slice' }) });
      continue;
    }
    if (c && c.ok && c.heldAuc - mine.heldAuc > barOn(mine.heldAuc, ds.heldRows)) { recipes.push(e.champion); organs.push({ domain, adopted: true, from: mine.heldAuc, to: c.heldAuc }); }
    else { recipes.push(recipe); organs.push({ domain, adopted: false, from: mine.heldAuc, candidate: c && c.ok ? c.heldAuc : null, why: 'no candidate beat it on cases the evolver never saw' }); }
  }
  const child = await seal({ name: p.fields.name, parents: [p.id], gate: p.fields.gate, organs: recipes }, keys);
  if (!child.ok) return no('the child could not be sealed: ' + child.why);
  return { ok: true, child: child.text, id: child.id, organs };
}
