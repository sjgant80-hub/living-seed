// immune.mjs — THE IMMUNE SYSTEM (SENTINEL): every attack makes it stronger, and it never turns on itself.
//
// Build-order step 9. The gate (organ 3) already refuses every message that is not signed by a trusted key, addressed
// to this organism and on the sender's next counter. What the gate cannot do alone, this organ does:
//
//   memory     — bytes this node refused are remembered by fingerprint and refused on sight if they come again, in a
//                memory that never grows past its cap (oldest forgotten first), so remembering is not itself a way in.
//   the rebound — the cost law, from break-it (sjgant80-hub/break-it): a source the gate keeps refusing must, past a
//                free allowance, attach proof-of-work before its bytes are even looked at, and the work it owes rises
//                with every refusal and never falls. The defender's cost to refuse is one hash; nothing is sent back.
//   proofs     — a key that signs two different messages with the same counter for the same organism is in two hands
//                (an honest node never does it: its counter only rises). The two signed messages ARE the proof, and
//                any node checks them itself before acting — so a proof spreads the immunity, and no node can be
//                smeared by one, because a proof against an honest key cannot be made.
//   behaviour  — a stolen key that is not used alongside its owner leaves no proof. What it does instead is behave
//                unlike its owner. Each node keeps, for each peer, a baseline of what that peer says and how much,
//                built only from the peer's own behaviour (one-class: no attack is ever needed to train it), and cuts
//                the peer off when a round departs from it by more than honest behaviour was measured to.
//                After Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "GEP-Based
//                Security: Behavioral Entropy Signatures for Cybersecurity and DevOps," 2025 (open defensive prior
//                art, CC BY 4.0): identity is not enough; behaviour is authoritative. Behaviour judgements stay with
//                the node that made them — they cannot be re-run by another node, so they are never spread.
//
// Powered by the Konomi architecture, created by Thomas Frumkin. Pure apart from the signature check (WebCrypto Ed25519);
// total: hostile input is a refusal, never a throw.
import { verify } from '../vendor/keys/keys.mjs';
import { utf8 } from '../vendor/keys/canon.mjs';
import { signedText, fingerprintOf, MAX_MSG } from './gate.mjs';
import { sha256Hex } from '../vendor/seed-library/sha256.mjs';
import { round6 } from '../vendor/seed-library/seedlib.mjs';

/* ─── memory ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Refused bytes, by fingerprint, never more than cap of them: the oldest is forgotten first. */
export function memory(cap = 256) {
  const known = new Map();   // insertion order is age
  return {
    cap,
    add(text, family) {
      const fp = fingerprintOf(text);
      known.delete(fp);
      known.set(fp, family);
      while (known.size > cap) known.delete(known.keys().next().value);
      return fp;
    },
    seen: (text) => known.get(fingerprintOf(text)) || null,
    size: () => known.size,
    digest: () => sha256Hex(JSON.stringify([...known].sort())).slice(0, 16),
  };
}

/* ─── the rebound ────────────────────────────────────────────────────────────────────────────────────────────── */

/** The law: limit refusals are free; past it a source owes base bits of work, one more bit for every step refusals,
 *  never more than max (a verifier never trusts a larger ask). */
export const LAW = Object.freeze({ limit: 16, base: 8, step: 16, max: 24 });
const NONCE = /^[0-9a-f]{1,16}$/;

/** The bits of work a source owes after this many refusals. 0 under the limit; never falls as refusals rise. */
export function owed(refusals, law = LAW) {
  if (!Number.isSafeInteger(refusals) || refusals < law.limit) return 0;
  return Math.min(law.max, law.base + Math.floor((refusals - law.limit) / law.step));
}

/** Leading zero bits of a hex digest. */
export function zeroBits(hex) {
  let bits = 0;
  for (const ch of String(hex)) {
    const v = parseInt(ch, 16);
    if (!(v >= 0)) return bits;
    if (v > 0) return bits + Math.clz32(v) - 28;
    bits += 4;
  }
  return bits;
}

/** The one hash a stamp is checked with: bound to the source and the exact bytes, so it buys one look, once. */
export const stampHash = (source, text, nonce) => sha256Hex('living-seed/rebound|' + source + '|' + nonce + '|' + text);

/** Does this nonce pay bits of work for these bytes from this source? One hash; true when nothing is owed. */
export function paid(source, text, nonce, bits) {
  if (!(bits > 0)) return true;
  if (!NONCE.test(nonce)) return false;   // test() reads a non-string as its text: undefined, 7 and the like fail or are the same nonce
  return zeroBits(stampHash(source, text, nonce)) >= bits;
}

/** Pay: search nonces from 0 for one that pays, spending at most budget hashes. → { nonce | null, spent } */
export function solve(source, text, bits, budget) {
  if (!(bits > 0)) return { nonce: '0', spent: 0 };
  for (let i = 0; i < budget; i++) {
    const nonce = i.toString(16);
    if (zeroBits(stampHash(source, text, nonce)) >= bits) return { nonce, spent: i + 1 };
  }
  return { nonce: null, spent: budget };
}

/** Each source's refusals, and what it now owes. */
export function rebound(law = LAW) {
  const refusals = new Map();
  return {
    refused(source) { refusals.set(source, (refusals.get(source) || 0) + 1); return owed(refusals.get(source), law); },
    owes: (source) => owed(refusals.get(source) || 0, law),
    count: (source) => refusals.get(source) || 0,
  };
}

/* ─── proofs ─────────────────────────────────────────────────────────────────────────────────────────────────── */

const FIELDS = ['from ', 'to ', 'n ', 'body ', 'sig '];
/** An envelope's fields, read from text the gate has already checked the form of. → { kind, from, to, n, body, sig } | null */
export function fieldsOf(text) {
  const lines = String(text).split('\n'), m = /^◊ msg\.v1 ([a-z]+)$/.exec(lines[0]);
  if (!m || lines.length !== 6 || !FIELDS.every((p, i) => lines[i + 1].startsWith(p))) return null;
  const [from, to, n, body, sig] = FIELDS.map((p, i) => lines[i + 1].slice(p.length));
  return { kind: m[1], from, to, n: Number(n), body, sig };
}

/** The messages a node admitted, by sender and counter — only the last window counters per sender are kept. */
export function ledger(window = 8) {
  const by = new Map();
  return {
    keep(from, n, text) {
      const m = by.get(from) || new Map();
      m.set(n, text);
      for (const k of [...m.keys()]) if (k <= n - window) m.delete(k);
      by.set(from, m);
    },
    at: (from, n) => (by.get(from) && by.get(from).get(n)) || null,
  };
}

/** A message the gate refused as a replay — its signature verified, its counter already spent — that differs from the
 *  message this node admitted on that counter: the key signed two messages for one counter. → { a, b } | null */
export function caught(text, led) {
  const f = fieldsOf(text);
  if (!f) return null;
  const prior = led.at(f.from, f.n);
  return prior && prior !== text ? { a: prior, b: text } : null;
}

const hex = (s) => [...utf8(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16)));
/** The body of a proof message: the key, the organism and counter both messages name, and each message's kind,
 *  signature and body (hex). */
export const PROOF = /^[0-9a-f]{64} [0-9a-f]{16} [1-9][0-9]{0,15} [a-z]{1,12} [0-9a-f]{128} [a-z]{1,12} [0-9a-f]{128} [0-9a-f]{2,400} [0-9a-f]{2,400}$/;
/** The room a proof body has: what is left of a message once its other lines are written. */
export const PROOF_ROOM = MAX_MSG - 260;

/** Write the proof that a key signed both a and b. → body | null when the two are not a proof, or too large to send */
export function proofOf(a, b) {
  const x = fieldsOf(a), y = fieldsOf(b);
  if (!x || !y || x.from !== y.from || x.to !== y.to || x.n !== y.n || a === b) return null;
  const body = [x.from, x.to, x.n, x.kind, x.sig, y.kind, y.sig, hex(x.body), hex(y.body)].join(' ');
  return PROOF.test(body) && body.length <= PROOF_ROOM ? body : null;
}

/** Check a proof yourself: both messages are re-built and both signatures verified with the key it names; they must
 *  name the same organism and counter, be written the one way messages are, and differ. grammar: what each kind's body
 *  must look like. → { ok: true, from } | { ok: false, why } */
export async function checkProof(body, grammar) {
  try {
    if (!PROOF.test(body)) return { ok: false, why: 'not a proof' };
    const [from, to, n, ka, sa, kb, sb, ha, hb] = body.split(' ');
    if (ha.length % 2 || hb.length % 2) return { ok: false, why: 'not a proof' };
    const msgs = [[ka, sa, unhex(ha)], [kb, sb, unhex(hb)]].map(([kind, sig, b]) => ({ kind, sig, text: signedText({ kind, from, to, n, body: b }), body: b }));
    for (const m of msgs) if (!grammar.kinds.includes(m.kind) || !grammar.body[m.kind].test(m.body)) return { ok: false, why: 'a message in it is not one the gate would read' };
    if (msgs[0].text === msgs[1].text) return { ok: false, why: 'the two messages are the same message' };
    for (const m of msgs) if (!(await verify(from, m.sig, utf8(m.text)))) return { ok: false, why: 'a signature in it does not verify' };
    return { ok: true, from };
  } catch { return { ok: false, why: 'not a proof' }; }
}

/* ─── behaviour ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** What one admitted message says, as one token: its kind and what it is about (an advert's score to 0.05). */
export function tokenOf(msg) {
  const p = String(msg.body).split(' ');
  if (msg.kind === 'advert') return 'advert ' + p[0] + ' ' + (Math.floor(Number(p[1]) * 20) / 20).toFixed(2);
  if (msg.kind === 'task' || msg.kind === 'lesson') return msg.kind + ' ' + (msg.kind === 'task' ? p[1] : p[2]);
  if (msg.kind === 'reply') return 'reply ' + p[1];
  return msg.kind;
}

/** How far one round's mix of tokens is from the baseline's: half the L1 distance of the two shares, 0…1. */
export function drift(window, base) {
  const keys = new Set([...window.keys(), ...base.keys()]), wn = [...window.values()].reduce((a, b) => a + b, 0), bn = [...base.values()].reduce((a, b) => a + b, 0);
  let d = 0;   // an empty side gives 0/0 shares, which round6 reads as 0: no window or no baseline, no drift
  for (const k of keys) d += Math.abs((window.get(k) || 0) / wn - (base.get(k) || 0) / bn);
  return round6(d / 2);
}

/** CALIBRATE rounds build a peer's baseline before it is judged; RATE is how fast an allowed round folds into it. */
export const CALIBRATE = 3, RATE = 0.25;

/** Fold a round's token counts into a baseline of shares: the first round is the baseline; later ones move it RATE of
 *  the way. Tokens the round lacks fade; they are not dropped. */
function foldMix(base, window, total, rounds) {
  const next = new Map();
  for (const k of new Set([...base.keys(), ...window.keys()])) next.set(k, round6(rounds ? (1 - RATE) * (base.get(k) || 0) + RATE * ((window.get(k) || 0) / total) : (window.get(k) || 0) / total));
  return next;
}
const foldVolume = (volume, total, rounds) => round6(rounds ? (1 - RATE) * volume + RATE * total : total);

/**
 * One node's watch over its peers. limits: { drift, volume } — a round whose token mix drifts from the peer's baseline
 * by more than limits.drift, or that carries more than limits.volume times the peer's usual number of messages, cuts
 * the peer off. Only allowed rounds fold into a baseline, so an attacker cannot teach it to accept him.
 * → { observe(peer, msg), close(round) → [{ peer, verdict, drift, volume }], cut(peer), state(peer) }
 */
export function behaviour(limits) {
  const peers = new Map();
  const at = (peer) => peers.get(peer) || peers.set(peer, { base: new Map(), volume: 0, rounds: 0, window: new Map(), n: 0, cut: false }).get(peer);
  return {
    observe(peer, msg) { const s = at(peer), t = tokenOf(msg); s.window.set(t, (s.window.get(t) || 0) + 1); s.n++; },
    close(round) {
      const out = [];
      for (const peer of [...peers.keys()].sort()) {
        const s = peers.get(peer);
        if (!s.n || s.cut) { s.window = new Map(); s.n = 0; continue; }
        const d = drift(s.window, s.base), v = round6(s.rounds ? (s.n + 1) / (s.volume + 1) : 1);
        const verdict = s.rounds < CALIBRATE ? 'CALIBRATING' : d > limits.drift || v > limits.volume ? 'CUT' : 'ALLOW';
        if (verdict === 'CUT') s.cut = true;
        else { s.base = foldMix(s.base, s.window, s.n, s.rounds); s.volume = foldVolume(s.volume, s.n, s.rounds); s.rounds++; }
        out.push({ round, peer, verdict, drift: d, volume: v });
        s.window = new Map(); s.n = 0;
      }
      return out;
    },
    cut: (peer) => Boolean(peers.get(peer) && peers.get(peer).cut),
    state: (peer) => { const s = peers.get(peer); return s ? { rounds: s.rounds, volume: s.volume, cut: s.cut, base: Object.fromEntries([...s.base].sort()) } : null; },
  };
}

/** Limits from honest behaviour alone: the largest drift and volume honest rounds were seen to reach (after
 *  calibrating), with margin to spare. closes: every close() result of a run with no attacker in it. */
export function limitsFrom(closes, margin = 1.25) {
  const judged = closes.filter((c) => c.verdict !== 'CALIBRATING');
  const top = (k) => judged.reduce((a, c) => Math.max(a, c[k]), 0);
  return { drift: round6(Math.min(1, top('drift') * margin)), volume: round6(Math.max(1, top('volume') * margin)), rounds: judged.length };
}

/* ─── behaviour, by channel (organ 9b) ─────────────────────────────────────────────────────────────────────── */

/** Gary W. Floyd's signatures are kept per domain of behaviour, each against its own baseline. Here: what a peer CLAIMS
 *  (its adverts: which organs, how good) and how it otherwise CONDUCTS itself (tasks, replies, lessons, proofs) — so a
 *  handful of jumpy task counts cannot drown a change in what it says it can do — plus how much it sends. */
export const CHANNELS = Object.freeze(['claims', 'conduct']);
export const channelOf = (msg) => (msg.kind === 'advert' ? 'claims' : 'conduct');

/**
 * One node's watch over its peers, by channel. limits: { claims, conduct, volume }. A channel is judged once it has
 * CALIBRATE rounds of its own and the round carries some of it; volume once the peer has CALIBRATE rounds. A round
 * over any limit cuts the peer; only allowed rounds fold in. A channel not judged this round reports null.
 * → { observe(peer, msg), close(round) → [{ round, peer, verdict, claims, conduct, volume }], cut(peer), state(peer) }
 */
export function channels(limits) {
  const peers = new Map(), fresh = () => ({ base: new Map(), rounds: 0, window: new Map(), n: 0 });
  const at = (peer) => peers.get(peer) || peers.set(peer, { claims: fresh(), conduct: fresh(), volume: 0, rounds: 0, n: 0, cut: false }).get(peer);
  return {
    observe(peer, msg) { const s = at(peer), c = s[channelOf(msg)], t = tokenOf(msg); c.window.set(t, (c.window.get(t) || 0) + 1); c.n++; s.n++; },
    close(round) {
      const out = [];
      for (const peer of [...peers.keys()].sort()) {
        const s = peers.get(peer);
        if (s.n && !s.cut) {
          const row = { round, peer, verdict: 'CALIBRATING' };
          let over = false;
          for (const k of CHANNELS) {
            const c = s[k], judged = c.n > 0 && c.rounds >= CALIBRATE;
            row[k] = judged ? drift(c.window, c.base) : null;
            if (judged) row.verdict = 'ALLOW';
            if (judged && row[k] > limits[k]) over = true;
          }
          row.volume = s.rounds >= CALIBRATE ? round6((s.n + 1) / (s.volume + 1)) : null;
          if (row.volume !== null) row.verdict = 'ALLOW';
          if (row.volume !== null && row.volume > limits.volume) over = true;
          if (over) { row.verdict = 'CUT'; s.cut = true; }
          else {
            for (const k of CHANNELS) { const c = s[k]; if (c.n) { c.base = foldMix(c.base, c.window, c.n, c.rounds); c.rounds++; } }
            s.volume = foldVolume(s.volume, s.n, s.rounds); s.rounds++;
          }
          out.push(row);
        }
        for (const k of CHANNELS) { s[k].window = new Map(); s[k].n = 0; }
        s.n = 0;
      }
      return out;
    },
    cut: (peer) => Boolean(peers.get(peer) && peers.get(peer).cut),
    state: (peer) => { const s = peers.get(peer); return s ? { rounds: s.rounds, volume: s.volume, cut: s.cut, ...Object.fromEntries(CHANNELS.map((k) => [k, { rounds: s[k].rounds, base: Object.fromEntries([...s[k].base].sort()) }])) } : null; },
  };
}

/** Channel limits from honest rounds alone: per channel, the largest drift an honest round reached where it was judged,
 *  with margin (no more than 1 — a channel whose honest rounds reach 1 cannot tell anything apart); volume likewise, no
 *  less than 1. → { claims, conduct, volume, rounds } */
export function channelLimitsFrom(closes, margin = 1.25) {
  const top = (k) => closes.reduce((a, c) => (typeof c[k] === 'number' ? Math.max(a, c[k]) : a), 0);   // null: not judged that round
  return { claims: round6(Math.min(1, top('claims') * margin)), conduct: round6(Math.min(1, top('conduct') * margin)), volume: round6(Math.max(1, top('volume') * margin)), rounds: closes.filter((c) => c.verdict !== 'CALIBRATING').length };
}
