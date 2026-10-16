// gate.mjs — THE GATE (𝟙): nothing unproven enters, acts or replicates.
//
// Build-order step 3. Germination already gates KNOWLEDGE an organism grows (an organ that does not clear the bar on
// cases it never grew on is cut). This organ puts the same gate on the three doors left open:
//
//   input        — every message an organism receives is an envelope, checked on its raw bytes before a field of it
//                  is read: size → magic → shape → sender → signature → counter, in that order, then parsed; and
//                  the parse must write back out byte for byte (one form of every message). A message names the one
//                  organism it is for, and carries the sender's next counter — exactly the last one admitted plus
//                  one, inside the signed bytes — so it cannot be replayed, reordered, or redirected to another
//                  organism. Discipline from break-it (sjgant80-hub/break-it), re-made over WebCrypto Ed25519.
//   knowledge    — a LESSON (another organism's organ recipe) is never trusted for the score it claims: it is grown
//   from outside   here, on this device's own data, and adopted only if it clears this organism's gate AND beats the
//                  organ it would replace. Anything else is refused, with the number that refused it.
//   replication  — a child genome is sealed only from a genome that opens, by an organism grown from that very genome,
//                  carrying only organs that are LIVE on the parent's own device, at a bar no lower than the parent's,
//                  naming the parent in its lineage. Cut and dormant organs are not passed on: the organism spreads
//                  only what it has proven.
//
// Powered by the Konomi architecture, created by Thomas Frumkin. Pure apart from the signature (WebCrypto Ed25519) and
// total: every hostile input is a refusal naming the stage that refused it, never a throw.
import { sign, verify } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';
import { decodeSeed, encodeSeed, germinate as express } from '../vendor/seed-library/seedlib.mjs';
import { open, seal } from './genome.mjs';
import { stable } from './germinate.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';

export const MAGIC = '◊ msg.v1';
export const KINDS = Object.freeze(['lesson', 'antibody']);
export const MAX_MSG = 1024;
export const STAGES = Object.freeze(['size', 'magic', 'shape', 'sender', 'signature', 'counter', 'canonical', 'error', 'admitted']);
const PUB = /^[0-9a-f]{64}$/, ID = /^[0-9a-f]{16}$/, SIG = /^[0-9a-f]{128}$/, COUNTER = /^[1-9][0-9]{0,15}$/;
const BODY = {
  lesson: /^◊ seed\.v1 [a-z][a-z0-9-]{0,31} [1-9][0-9]{0,9} f:[0-9a-f]{20} [0-9a-f]{12}$/,
  antibody: /^[0-9a-f]{16} [a-z][a-z-]{0,31}$/,
};
/** The grammar the gate reads by default: which kinds exist, and the exact form of each kind's body. Another organ may
 *  hand the gate its own grammar (mesh.mjs does); the checks, their order and the signature are the same for every grammar. */
export const GRAMMAR = Object.freeze({ kinds: KINDS, body: BODY });
const ADMITTED = new WeakSet();
/** True only for a message this gate itself admitted. */
export const isAdmitted = (m) => typeof m === 'object' && m !== null && ADMITTED.has(m);
const refuse = (stage, why) => Object.freeze({ admit: false, stage, why });
const no = (why) => ({ ok: false, why });

/** The signed text of an envelope's fields (everything above its sig line). */
function bodyOf({ kind, from, to, n, body }) {
  return [MAGIC + ' ' + kind, 'from ' + from, 'to ' + to, 'n ' + n, 'body ' + body].join('\n');
}
/** The exact text a message's signature covers (organ 9 re-builds a message from a proof with it). */
export const signedText = bodyOf;

/** Write and sign one envelope. fields: { kind, to, n, body }; keys: { pub, priv }; grammar: GRAMMAR unless given.
 *  → { ok, text } | a refusal */
export async function envelope(fields, keys, grammar = GRAMMAR) {
  try {
    const { kind, to, n, body } = fields || {};
    if (!grammar.kinds.includes(kind)) return no(grammar === GRAMMAR ? 'a message is a lesson or an antibody' : 'a message is not a kind this grammar knows');
    if (typeof to !== 'string' || !ID.test(to)) return no('a message names the organism it is for');
    if (!Number.isSafeInteger(n) || n < 1) return no('a message carries a counter from 1');
    if (typeof body !== 'string' || !grammar.body[kind].test(body)) return no('the body is not a ' + kind);
    const text = bodyOf({ kind, from: keys.pub, to, n, body });
    return { ok: true, text: text + '\nsig ' + (await sign(keys, utf8(text))) };
  } catch { return no('the message could not be sealed'); }
}

/**
 * THE INPUT GATE. text: an envelope as received; ctx: { me: this organism's id, senders: { pub: [kinds it may send] },
 * last: (pub) → the last counter admitted from it (0 before the first), grammar: GRAMMAR unless given }.
 * → { admit: true, stage: 'admitted', msg } | { admit: false, stage, why } — nothing is parsed before the signature
 * and the counter pass.
 */
export async function admit(text, ctx) {
  try {
    const G = (ctx && ctx.grammar) || GRAMMAR;
    if (typeof text !== 'string' || utf8(text).length > MAX_MSG) return refuse('size', 'not a message of at most ' + MAX_MSG + ' bytes');
    const lines = text.split('\n');
    const m = /^◊ msg\.v1 ([a-z]+)$/.exec(lines[0]);
    if (!m || !G.kinds.includes(m[1])) return refuse('magic', 'not a living-seed message');
    if (lines.length !== 6) return refuse('shape', 'a message is six lines');
    const kind = m[1], [from, to, n, body, sig] = ['from ', 'to ', 'n ', 'body ', 'sig '].map((p, i) => (lines[i + 1].startsWith(p) ? lines[i + 1].slice(p.length) : null));
    if (!PUB.test(from) || !ID.test(to) || !COUNTER.test(n) || !G.body[kind].test(body) || !SIG.test(sig)) return refuse('shape', 'a line is not in the form a ' + kind + ' takes');
    if (to !== ctx.me) return refuse('shape', 'the message is for another organism');
    const may = Object.prototype.hasOwnProperty.call(ctx.senders, from) ? ctx.senders[from] : null;
    if (!Array.isArray(may)) return refuse('sender', 'no trusted sender with that key');
    if (!may.includes(kind)) return refuse('sender', 'this sender may not send a ' + kind);
    const signed = text.slice(0, text.lastIndexOf('\nsig '));
    if (!(await verify(from, sig, utf8(signed)))) return refuse('signature', 'the signature does not verify');
    const last = ctx.last(from), count = Number(n);
    if (!Number.isSafeInteger(last) || last < 0) return refuse('error', 'no counter for that sender');
    if (count <= last) return refuse('counter', 'a replay: counter ' + count + ' is not after ' + last);
    if (count !== last + 1) return refuse('counter', 'out of order: expected ' + (last + 1) + ', got ' + count);
    const msg = { kind, from, to, n: count, body };
    if (bodyOf(msg) + '\nsig ' + sig !== text) return refuse('canonical', 'the message is not written the one way messages are written');
    Object.freeze(msg);
    ADMITTED.add(msg);
    return Object.freeze({ admit: true, stage: 'admitted', msg });
  } catch { return refuse('error', 'the gate failed closed'); }
}

/**
 * THE KNOWLEDGE GATE. An admitted lesson's recipe, grown on this device's own data for its domain and graded on cases
 * it never grew on. Adopted only if it clears the organism's bar and beats the organ it would replace (an organ for a
 * domain the organism lacks needs only to clear the bar). → { adopt: true, organ } | { adopt: false, why, heldAuc? }
 */
export function weigh(msg, organism, substrate) {
  try {
    if (!isAdmitted(msg) || msg.kind !== 'lesson') return { adopt: false, why: 'only an admitted lesson is weighed' };
    const d = decodeSeed(msg.body);
    if (!d.ok || encodeSeed(d.seed) !== msg.body) return { adopt: false, why: 'the lesson is not a seed the ribosome reads' };
    const domain = d.seed.domain, data = substrate && substrate.data;
    const ds = data && Object.prototype.hasOwnProperty.call(data, domain) ? data[domain] : null;
    if (!ds || ds.ok === false) return { adopt: false, why: 'this device holds no ' + domain + ' data to test it on' };
    const g = express(ds, msg.body);
    if (!g.ok) return { adopt: false, why: 'it could not grow here: ' + g.error };
    const bar = organism.gate.auc, mine = organism.organs.find((o) => o.domain === domain);
    if (!(g.heldAuc >= bar)) return { adopt: false, why: 'AUC ' + g.heldAuc + ' on this device’s unseen cases is under the gate (' + bar + ')', heldAuc: g.heldAuc };
    if (mine && mine.state === 'live' && !(g.heldAuc > mine.heldAuc)) return { adopt: false, why: 'AUC ' + g.heldAuc + ' does not beat the ' + domain + ' organ it would replace (' + mine.heldAuc + ')', heldAuc: g.heldAuc };
    return { adopt: true, organ: { domain, recipe: msg.body, heldAuc: g.heldAuc, held: g.held, from: msg.from, n: msg.n } };
  } catch { return { adopt: false, why: 'the lesson could not be weighed' }; }
}

/**
 * THE REPLICATION GATE. Seal a child of a genome, carrying the named organs. Refused unless the parent genome opens
 * (under opts.trust), the organism was grown from it, every organ the child carries is live in that organism, the
 * child's bar is no lower than the parent's, and the maker is allowed (opts.makers, when given).
 * fields: { name, organs: [domain…], gate: { auc } }; keys: the child's maker. → { ok, text, id } | a refusal
 */
export async function replicate(parentText, organism, fields, keys, opts = {}) {
  try {
    const p = await open(parentText, opts.trust ? { trust: opts.trust } : {});
    if (!p.ok) return no('the parent genome was refused: ' + p.why);
    if (!organism || organism.genome !== p.id) return no('the organism was not grown from this genome');
    const { name, organs, gate } = fields || {};
    if (!Array.isArray(organs) || !organs.length) return no('a child carries at least one organ');
    const recipes = [];
    for (const d of organs) {
      const o = organism.organs.find((x) => x.domain === d);
      if (!o) return no('the parent has no ' + d + ' organ to pass on');
      if (o.state !== 'live') return no('the ' + d + ' organ is ' + o.state + ' on this device, and only a proven organ is passed on');
      recipes.push(o.recipe);
    }
    if (!gate || !(gate.auc >= p.fields.gate.auc)) return no('a child’s bar may not be lower than its parent’s (' + p.fields.gate.auc + ')');
    if (Array.isArray(opts.makers) && !opts.makers.includes(keys && keys.pub)) return no('this maker may not seal children');
    return await seal({ name, parents: [p.id], gate, organs: recipes }, keys);
  } catch { return no('the child could not be sealed'); }
}

/** The fingerprint an antibody names: the first 16 hex of the SHA-256 of a refused input. */
export const fingerprintOf = (text) => sha256Hex(String(text)).slice(0, 16);

/** A refusal remembered as a fingerprint, so the same bytes are refused on sight next time. → { seen(text), add(text, family),
 *  adopt(fingerprint, family) — a peer's antibody, size(), digest() } */
export function immune() {
  const known = new Map();
  return {
    add: (text, family) => { known.set(fingerprintOf(text), family); return fingerprintOf(text); },
    adopt: (fp, family) => { if (/^[0-9a-f]{16}$/.test(fp)) known.set(fp, family); return known.has(fp); },   // an antibody from a peer: the fingerprint alone
    seen: (text) => known.get(fingerprintOf(text)) || null,
    size: () => known.size,
    digest: () => sha256Hex(stable([...known].sort())).slice(0, 16),
  };
}
