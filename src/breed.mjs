// breed.mjs — ⋈: two genomes breed a child that carries both lineages, sealed only with organs that prove themselves.
//
// Build-order step 5 (the recombination half). Both parents are opened under their seals first. For each domain either
// parent carries, the child's recipe is: the two parents' rule genomes crossed rule by rule (the ribosome's crossover,
// seeded) when both carry it, or the one parent's recipe when only one does. The child names both parents, and its bar
// is the higher of theirs. Then the gate rides reproduction: the candidate child is germinated on the breeder's own
// device, every organ that does not go live there is dropped (with the reason), and the child is sealed carrying only
// the organs that did — or not at all, if none did. A child is never a promise; it is what grew.
//
// The crossover is seed-library's (sjgant80-hub), vendored unchanged. Powered by the Konomi architecture, created by
// Thomas Frumkin. Total: every hostile input is a refusal, never a throw.
import { decodeSeed, encodeSeed, crossGenome, rng } from '../vendor/seed-library/seedlib.mjs';
import { open, seal } from './genome.mjs';
import { germinate } from './germinate.mjs';

const no = (why) => ({ ok: false, why });

/** The child's recipes before the gate: crossed where both parents carry a domain. → [{ domain, recipe, from }] */
export function recombine(fieldsA, fieldsB, seed = 1) {
  const of = (f) => new Map(f.organs.map((o) => [decodeSeed(o).seed.domain, o]));
  const A = of(fieldsA), B = of(fieldsB), domains = [...A.keys(), ...[...B.keys()].filter((d) => !A.has(d))];
  return domains.map((domain, i) => {
    if (!A.has(domain)) return { domain, recipe: B.get(domain), from: 'b' };
    if (!B.has(domain)) return { domain, recipe: A.get(domain), from: 'a' };
    const a = decodeSeed(A.get(domain)).seed, b = decodeSeed(B.get(domain)).seed;
    if (!a.genome || !b.genome) return { domain, recipe: A.get(domain), from: 'a' };
    return { domain, recipe: encodeSeed({ domain, seed: a.seed, genome: crossGenome(a.genome, b.genome, rng(seed * 1009 + i)) }), from: 'both' };
  });
}

/**
 * Breed two sealed genomes on a substrate (the breeder's own data). keys: the child's maker. opts: { name, seed, trust }.
 * → { ok, text, id, organism, crossed: [domain], dropped: [{ domain, why }] } | a refusal
 */
export async function breed(textA, textB, substrate, keys, opts = {}) {
  try {
    const { name = 'child', seed = 1, trust } = opts || {};
    const t = Array.isArray(trust) ? { trust } : {};
    const a = await open(textA, t), b = await open(textB, t);
    if (!a.ok) return no('the first parent was refused: ' + a.why);
    if (!b.ok) return no('the second parent was refused: ' + b.why);
    if (a.id === b.id) return no('a genome cannot breed with itself');
    const bar = { auc: Math.max(a.fields.gate.auc, b.fields.gate.auc) }, parents = [a.id, b.id];
    const plan = recombine(a.fields, b.fields, seed);
    const candidate = await seal({ name, parents, gate: bar, organs: plan.map((p) => p.recipe) }, keys);
    if (!candidate.ok) return no('the child could not be sealed: ' + candidate.why);
    const grown = await germinate(candidate.text, substrate);
    if (!grown.ok) return no('the child could not grow here: ' + grown.why);
    const live = new Set(grown.organism.organs.filter((o) => o.state === 'live').map((o) => o.domain));
    const dropped = grown.organism.organs.filter((o) => !live.has(o.domain)).map((o) => ({ domain: o.domain, why: o.state + ': ' + o.why }));
    if (!live.size) return no('no organ of the child is proven on this device');
    const child = dropped.length ? await seal({ name, parents, gate: bar, organs: plan.filter((p) => live.has(p.domain)).map((p) => p.recipe) }, keys) : candidate;
    const organism = dropped.length ? (await germinate(child.text, substrate)).organism : grown.organism;
    return { ok: true, text: child.text, id: child.id, organism, crossed: plan.filter((p) => p.from === 'both' && live.has(p.domain)).map((p) => p.domain), dropped };
  } catch { return no('the parents could not be bred'); }
}
