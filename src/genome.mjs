// genome.mjs — THE GENOME: a whole organism's recipe in a few hundred readable bytes, sealed by the one who made it.
//
// A genome is the Living Seed's first organ (spec §1A, build-order step 1). It carries no trained weights — only the
// recipes a universal ribosome grows the organism from, on the device's own data:
//
//   ◊ life.v1 <name>                       what it is
//   parents <-|id[,id]>                    its lineage: none (a first organism), one, or two (a child of two)
//   gate auc=<0.xxx>                       the bar every organ must clear on cases it never grew on, or be cut
//   organ ◊ seed.v1 <domain> <seed> …      one line per organ: a seed-library seed, the recipe for one verified pattern
//   by <ed25519 public key>                who made it
//   sig <ed25519 signature>                over every line above
//
// The signature is the seal. A seed-library seed carries only an HMAC under a key every ribosome holds — it catches a
// corrupted seed, not a forged one. A genome is checked before anything in it is read (verify before parse): the last
// line and the maker's key are found by position, the signature is verified over the exact bytes, and only then are the
// organs parsed — strictly, and re-rendered, so there is one byte form of every genome and a re-wrapped one is refused.
// A genome's id is the SHA-256 of its signed body: its children name it in their parents line.
//
// Powered by the Konomi architecture, created by Thomas Frumkin: the konomi-family tag and the compressed-genome idea are
// his. The seed format and the ribosome are seed-library's (sjgant80-hub), vendored unchanged. Pure apart from the
// signature, which is WebCrypto Ed25519 (the same in Node and every modern browser); total — junk gets a refusal in
// plain words, never a throw.
import { decodeSeed, encodeSeed } from '../vendor/seed-library/seedlib.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { sign, verify } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';

export const TAG = '◊ life.v1';
export const MAX_BYTES = 2048;     // a genome is small by design: a card carries it
export const MAX_ORGANS = 8;
export const MAX_PARENTS = 2;      // one parent, or two (a child bred of both)
export const GATE_AUC = 0.6;       // the default bar: better than a coin (0.5) by a clear margin

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const ID = /^[0-9a-f]{16}$/;
const PUB = /^[0-9a-f]{64}$/;
const SIG = /^[0-9a-f]{128}$/;
const GATE = /^gate auc=(0\.[5-9][0-9]{0,2}|1)$/;
const no = (why) => ({ ok: false, why });

/** A gate bar as the genome writes it: 0.5 … 1, at most three decimals. → the text, or '' when it is not one. */
export function gateText(auc) {
  const t = typeof auc !== 'number' ? '' : auc === 1 ? '1' : String(Math.round(auc * 1000) / 1000);
  return GATE.test('gate auc=' + t) && Number(t) === auc ? t : '';   // the pattern holds the range; the round trip, the decimals
}

/**
 * The signed body of a genome from its fields: { name, parents: [id…], gate: { auc }, organs: [seed text…], by }.
 * → { ok, text } — or a refusal naming the first field that is wrong.
 */
export function body(fields) {
  try {
    const { name, parents = [], gate = { auc: GATE_AUC }, organs, by } = fields;
    if (typeof name !== 'string' || !NAME.test(name)) return no('the name is lower-case letters, digits and hyphens, at most 32');
    if (!Array.isArray(parents) || parents.length > MAX_PARENTS || !parents.every((p) => typeof p === 'string' && ID.test(p))) return no('parents are at most two genome ids');
    if (new Set(parents).size !== parents.length) return no('a parent is named twice');
    const g = gateText(gate && gate.auc);
    if (!g) return no('the gate is an AUC from 0.5 to 1, at most three decimals');
    if (!Array.isArray(organs) || organs.length < 1 || organs.length > MAX_ORGANS) return no('a genome carries one to ' + MAX_ORGANS + ' organs');
    const domains = new Set();
    for (const o of organs) {
      const d = typeof o === 'string' && !o.includes('\n') ? decodeSeed(o) : null;
      if (!d || !d.ok) return no('an organ is not a seed the ribosome reads: ' + (d && d.error ? d.error : 'not text'));
      // one byte form: the ribosome forgives a stray space; a genome does not, or one recipe would have two ids
      if (encodeSeed(d.seed) !== o) return no('an organ is not written the one way the ribosome writes it');
      if (!NAME.test(d.seed.domain)) return no('an organ names its domain in lower-case letters, digits and hyphens');
      if (domains.has(d.seed.domain)) return no('two organs for one domain: ' + d.seed.domain);
      domains.add(d.seed.domain);
    }
    if (typeof by !== 'string' || !PUB.test(by)) return no('the maker is an Ed25519 public key (64 hex)');
    const text = [TAG + ' ' + name, 'parents ' + (parents.length ? parents.join(',') : '-'), 'gate auc=' + g, ...organs.map((o) => 'organ ' + o), 'by ' + by].join('\n');
    return { ok: true, text };   // at most 8 organ lines of a few dozen bytes: always well under MAX_BYTES
  } catch { return no('the genome could not be read'); }
}

/** A genome's id: the first 16 hex of the SHA-256 of its signed body. */
export const idOf = (bodyText) => sha256Hex(String(bodyText)).slice(0, 16);

/** Seal a genome with the maker's keys ({ pub, priv } — keys.mjs). → { ok, text, id } */
export async function seal(fields, keys) {
  try {
    if (!keys || typeof keys.pub !== 'string') return no('no maker keys');
    const b = body({ ...fields, by: keys.pub });
    if (!b.ok) return b;
    const sig = await sign(keys, utf8(b.text));
    return { ok: true, text: b.text + '\nsig ' + sig, id: idOf(b.text) };
  } catch { return no('the genome could not be sealed'); }
}

/** The fields of a body that has already been verified — strict, in order, every line known. → fields | null */
function parse(text) {
  const lines = text.split('\n');
  if (lines.length < 5) return null;   // open() has already seen the tag on the first line
  const name = lines[0].slice(TAG.length + 1);
  const p = /^parents (-|[0-9a-f]{16}(,[0-9a-f]{16})?)$/.exec(lines[1]);
  const g = GATE.exec(lines[2]);
  if (!p || !g) return null;
  const organs = lines.slice(3, -1);
  if (!organs.every((l) => l.startsWith('organ '))) return null;
  return { name, parents: p[1] === '-' ? [] : p[1].split(','), gate: { auc: Number(g[1]) }, organs: organs.map((l) => l.slice(6)), by: lines[lines.length - 1].slice(3) };
}

/**
 * Open a genome — VERIFY BEFORE PARSE. opts.trust: a list of maker keys this device accepts (none given: any maker, and
 * the organism records who made it). → { ok, id, fields, body, sig } — or a refusal: 'not a genome', 'too large',
 * 'not signed', 'untrusted maker', 'signature', 'not canonical'. Nothing in a refused genome is read past its seal.
 */
export async function open(text, opts = {}) {
  try {
    if (typeof text !== 'string' || !text.startsWith(TAG + ' ')) return no('not a genome');
    if (utf8(text).length > MAX_BYTES) return no('too large');
    const cut = text.lastIndexOf('\nsig ');
    const sig = text.slice(cut + 5);   // with no sig line (cut -1) this is the text itself, which is not a signature
    if (!SIG.test(sig)) return no('not signed');
    const bodyText = text.slice(0, cut);
    const by = bodyText.slice(bodyText.lastIndexOf('\n') + 1);
    if (!by.startsWith('by ') || !PUB.test(by.slice(3))) return no('not signed');
    const trust = opts && Array.isArray(opts.trust) ? opts.trust : null;
    if (trust && !trust.includes(by.slice(3))) return no('untrusted maker');
    if (!(await verify(by.slice(3), sig, utf8(bodyText)))) return no('signature');
    const fields = parse(bodyText);
    const again = fields ? body(fields) : null;
    if (!again || !again.ok || again.text !== bodyText) return no('not canonical');
    return { ok: true, id: idOf(bodyText), fields, body: bodyText, sig };
  } catch { return no('not a genome'); }
}
