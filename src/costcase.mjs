// src/costcase.mjs — the cost case for the "For your business" brochure: one decision your people make over and over at
// every site (will this visitor buy, which referral goes first), costed three ways. Today: your people make the call.
// A hosted model: every record is sent to a model in the cloud, with the prompt organ 2b gave the 14B. The Living Seed:
// each site grows its own organism from its own records and answers on the machine it already has.
// Every external figure is read from the vendored, sourced basis (vendor/sovereign-enterprise/data/basis.json, byte for
// byte as sjgant80-hub/sovereign-enterprise sourced it). What a hosted model is sent, how long the organ takes to answer
// and how big the genome is are read from this repository's own receipts. The sites, the records, the hours and the share
// are the reader's own. Floors, never top ends: staff time at the UK median wage with on-costs left out; CPI on every
// later year; the cheaper hosted model is priced too. Like for like: a hosted model takes the SAME share of the work off
// as the organism, so the two differ only in the bill and in where the records go. No price of ours appears here.
// Pure, total, deterministic: garbage in gives { ok: false, why }, never a throw.

export const DEFAULTS = Object.freeze({ sites: 40, recordsPerMonth: 10000, hoursPerWeek: 20, share: 0.5, years: 3, modelMB: 50, updatesPerYear: 12, gbpPerGb: null, gbpPer1000: null });
export const BASIS_KEYS = Object.freeze(['wageMedianHourly', 'cpi', 'electricityPencePerKwh', 'laptopExtraWatts', 'frontier', 'bedrockGptOss120b', 'fxGbpPerUsd']);

const isNum = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isCount = (x) => Number.isInteger(x) && x >= 0;
const r2 = (x) => Math.round(x * 100) / 100;

/** the basis entries the case reads, each a sourced number; null when one is missing or unreadable */
function figures(basis) {
  const b = basis || {}, f = (k) => b[k] || {};
  const out = {
    wage: f('wageMedianHourly').value, cpi: f('cpi').value, pence: f('electricityPencePerKwh').value, watts: f('laptopExtraWatts').value,
    frontierIn: f('frontier').inPerM, frontierOut: f('frontier').outPerM, openIn: f('bedrockGptOss120b').inPerM, openOut: f('bedrockGptOss120b').outPerM, fx: f('fxGbpPerUsd').value,
  };
  return Object.values(out).every(isNum) ? out : null;
}

/** where each figure came from, for the page to list beside the numbers */
export function sourcesOf(basis) {
  try { return BASIS_KEYS.map((k) => ({ key: k, what: basis[k].what || basis[k].product, source: basis[k].source })); } catch { return []; }
}

/** what the receipts measured: the prompt the 14B shown 24 examples was sent in organ 2b (median tokens, as its own
 *  tokenizer counted them), the longest reply it gave (in characters — a token is at least one, so this bounds the
 *  tokens back), the organ's time per answer and the box it was timed on (organ 2), and the genome's size (organ 1) */
export function measured(answers2b, record2, record1) {
  try {
    const calls = answers2b.calls, timing = record2.contest.organ.timing, bytes = record1.genome.bytes;
    if (!Array.isArray(calls) || calls.length === 0) return { ok: false, why: 'organ 2b’s committed calls' };
    const tokens = calls.map((c) => c.promptTokens), replies = calls.map((c) => c.reply);
    if (!tokens.every((t) => isCount(t) && t > 0) || !replies.every((r) => typeof r === 'string')) return { ok: false, why: 'organ 2b’s committed calls' };
    if (!isNum(timing.perAnswerUs) || timing.perAnswerUs === 0 || typeof timing.box !== 'string') return { ok: false, why: 'organ 2’s timing' };
    if (!isCount(bytes) || bytes === 0) return { ok: false, why: 'the genome’s size' };
    const sorted = [...tokens].sort((a, b) => a - b), mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { ok: true, calls: calls.length, tokensIn: median, tokensOut: Math.max(...replies.map((r) => r.length)), answerUs: timing.perAnswerUs, box: timing.box, genomeBytes: bytes };
  } catch { return { ok: false, why: 'the receipts could not be read' }; }
}

/** a yearly cost carried over `years`, rising by CPI each year after the first */
export function over(perYear, cpi, years) {
  let total = 0, factor = 1;
  for (let y = 0; y < years; y++) { total += perYear * factor; factor *= 1 + cpi; }
  return r2(total);
}

/** the case. m: measured(); input (all optional, defaults above; tokensIn / tokensOut default to the measured ones) */
export function seedCase(basis, m, input) {
  try {
    const f = figures(basis);
    if (!f) return { ok: false, why: 'a sourced basis with every figure the case reads' };
    if (!m || m.ok !== true || !isNum(m.answerUs) || !isCount(m.genomeBytes)) return { ok: false, why: 'the measured receipts' };
    const i = { ...DEFAULTS, tokensIn: m.tokensIn, tokensOut: m.tokensOut, ...(input || {}) };
    if (!isCount(i.sites) || i.sites < 1) return { ok: false, why: 'sites: a whole number, at least 1' };
    if (!isNum(i.recordsPerMonth) || !isNum(i.tokensIn) || !isNum(i.tokensOut)) return { ok: false, why: 'records and tokens: numbers' };
    if (!isNum(i.hoursPerWeek) || i.hoursPerWeek > 168) return { ok: false, why: 'hours a week: 0 to 168' };
    if (!isNum(i.share) || i.share > 1) return { ok: false, why: 'the share of the work taken off: 0 to 1' };
    if (!isCount(i.years) || i.years < 1 || i.years > 10) return { ok: false, why: 'years: 1 to 10' };
    if (!isNum(i.modelMB) || !isNum(i.updatesPerYear)) return { ok: false, why: 'model size and updates: numbers' };
    if ((i.gbpPerGb !== null && !isNum(i.gbpPerGb)) || (i.gbpPer1000 !== null && !isNum(i.gbpPer1000))) return { ok: false, why: 'your own costs: numbers, or left out' };
    const records = i.sites * i.recordsPerMonth * 12;                                            // every record answered, a year
    const staff = r2(i.hoursPerWeek * 52 * f.wage);                                              // the decision, in staff time, a year
    const takenOff = r2(staff * i.share);                                                        // the share the answers take off
    const perRecord = (inM, outM) => (i.tokensIn * inM + i.tokensOut * outM) / 1e6 * f.fx;       // one record, sent to a hosted model
    const frontier = r2(records * perRecord(f.frontierIn, f.frontierOut)), open = r2(records * perRecord(f.openIn, f.openOut));
    const sentOff = i.gbpPer1000 === null ? 0 : r2(records / 1000 * i.gbpPer1000);               // your own cost of sending records away
    const kwh = records * m.answerUs / 1e6 * f.watts / 3.6e6;                                    // the organ's answers: measured time × the chip's power
    const power = r2(kwh * f.pence / 100);
    const shippedMB = i.sites * i.modelMB * i.updatesPerYear, seedBytes = i.sites * m.genomeBytes * i.updatesPerYear;
    const shipping = i.gbpPerGb === null ? null : r2((shippedMB / 1024 - seedBytes / 1024 ** 3) * i.gbpPerGb);
    const perYear = { today: staff, hostedFrontier: r2(staff - takenOff + frontier + sentOff), hostedOpen: r2(staff - takenOff + open + sentOff), seed: r2(staff - takenOff + power) };
    const total = Object.fromEntries(Object.entries(perYear).map(([k, v]) => [k, over(v, f.cpi, i.years)]));
    return {
      ok: true, inputs: i, records, kwh, lines: { staff, takenOff, frontier, open, sentOff, power }, perYear, over: total,
      travel: { shippedMB, seedBytes, shipping, recordsLeaving: records },
      versus: { today: r2(perYear.today - perYear.seed), hostedFrontier: r2(perYear.hostedFrontier - perYear.seed), hostedOpen: r2(perYear.hostedOpen - perYear.seed) },
      versusOver: { today: r2(total.today - total.seed), hostedFrontier: r2(total.hostedFrontier - total.seed), hostedOpen: r2(total.hostedOpen - total.seed) },
    };
  } catch { return { ok: false, why: 'the inputs could not be read' }; }
}

export default { DEFAULTS, BASIS_KEYS, sourcesOf, measured, over, seedCase };
