// substrate.mjs — the compute layer, swappable: the same organ, scored on different substrates. Pure apart from
// instantiating a WebAssembly module from bytes held here.
//
// An organ is structure, not weights locked to a chip: a few rules (a measurement, a direction, a threshold, a weight)
// and a line. Scoring it is the only arithmetic, so the substrate that does that arithmetic can be swapped without
// touching the genome, the organism or anything grown:
//
//   f64     — JavaScript doubles, the reference (exactly germinate.mjs's answer)
//   int     — exact integers: every weight and the line in millionths (the organ's own six places), summed as integers
//   wasm    — a WebAssembly module, assembled by hand below (no build tool): a different engine, the same IEEE doubles
//   f32     — single precision for the inputs, thresholds, weights and the sum: a stand-in for a GPU or an analog part
//
//   SUBSTRATES                       the names, in that order
//   prepare(name)                    → a substrate { name, score(body, x) → { score, label } | null } (wasm is async)
//   verdictOf(substrate, body, x)    → { score, label } | null when the case lacks a measurement the rules read
//
// A substrate never decides what grows or what is live; it only scores a live organ's rules on one case.
import { round6 } from '../vendor/seed-library/seedlib.mjs';

export const SUBSTRATES = Object.freeze(['f64', 'int', 'wasm', 'f32']);
const readable = (body, x) => body && Array.isArray(body.rules) && x && typeof x === 'object' && body.rules.every((r) => typeof x[r.feat] === 'number' && Number.isFinite(x[r.feat]));

const f64 = { name: 'f64', score(body, x) {
  if (!readable(body, x)) return null;
  const s = round6(body.rules.filter((r) => (r.op === '>' ? x[r.feat] > r.v : x[r.feat] <= r.v)).reduce((a, r) => a + r.w, 0));
  return { score: s, label: s > body.threshold ? 1 : 0 };
} };

const MICRO = 1000000;
const int = { name: 'int', score(body, x) {
  if (!readable(body, x)) return null;
  let s = 0;
  for (const r of body.rules) if (r.op === '>' ? x[r.feat] > r.v : x[r.feat] <= r.v) s += Math.round(r.w * MICRO);
  return { score: s / MICRO, label: s > Math.round(body.threshold * MICRO) ? 1 : 0 };
} };

const F = Math.fround;
const f32 = { name: 'f32', score(body, x) {
  if (!readable(body, x)) return null;
  let s = F(0);
  for (const r of body.rules) if (r.op === '>' ? F(x[r.feat]) > F(r.v) : F(x[r.feat]) <= F(r.v)) s = F(s + F(r.w));
  return { score: round6(s), label: s > F(body.threshold) ? 1 : 0 };
} };

// The WebAssembly module, by hand. One function, score(n) → f64: for each of n rule records in memory (32 bytes each:
// the case's value f64 @0, the threshold f64 @8, the weight f64 @16, the direction i32 @24, 1 = '>' else '<='), add the
// weight when the rule fires, in order, from 0.0 — the same additions, in the same order, as the reference.
export const WASM = Uint8Array.of(
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,                         // magic, version 1
  0x01, 0x06, 0x01, 0x60, 0x01, 0x7f, 0x01, 0x7c,                         // types: (i32) → f64
  0x03, 0x02, 0x01, 0x00,                                                 // functions: one, of type 0
  0x05, 0x03, 0x01, 0x00, 0x01,                                           // memory: one page
  0x07, 0x0f, 0x02, 0x05, 0x73, 0x63, 0x6f, 0x72, 0x65, 0x00, 0x00, 0x03, 0x6d, 0x65, 0x6d, 0x02, 0x00,   // exports: score, mem
  0x0a, 0x53, 0x01, 0x51,                                                 // code: one body, 81 bytes
  0x02, 0x02, 0x7f, 0x01, 0x7c,                                           //   locals: i, p (i32); sum (f64)
  0x02, 0x40, 0x03, 0x40,                                                 //   block, loop
  0x20, 0x01, 0x20, 0x00, 0x4f, 0x0d, 0x01,                               //     if i >= n, out
  0x20, 0x01, 0x41, 0x05, 0x74, 0x21, 0x02,                               //     p = i << 5
  0x20, 0x02, 0x28, 0x02, 0x18,                                           //     the direction
  0x04, 0x7f,                                                             //     if '>'
  0x20, 0x02, 0x2b, 0x03, 0x00, 0x20, 0x02, 0x2b, 0x03, 0x08, 0x64,       //       x > v
  0x05,                                                                   //     else
  0x20, 0x02, 0x2b, 0x03, 0x00, 0x20, 0x02, 0x2b, 0x03, 0x08, 0x65,       //       x <= v
  0x0b,                                                                   //     end
  0x04, 0x40, 0x20, 0x03, 0x20, 0x02, 0x2b, 0x03, 0x10, 0xa0, 0x21, 0x03, 0x0b,   // if fired: sum += w
  0x20, 0x01, 0x41, 0x01, 0x6a, 0x21, 0x01,                               //     i++
  0x0c, 0x00, 0x0b, 0x0b,                                                 //   again; end loop, end block
  0x20, 0x03, 0x0b);                                                      //   sum

const MAX_RULES = 2048;                                                   // one page holds 2,048 records of 32 bytes
async function wasm() {
  const { instance } = await WebAssembly.instantiate(WASM);
  const { score: run, mem } = instance.exports;
  return { name: 'wasm', score(body, x) {
    if (!readable(body, x) || body.rules.length > MAX_RULES) return null;
    const dv = new DataView(mem.buffer);
    body.rules.forEach((r, i) => { const p = i * 32; dv.setFloat64(p, x[r.feat], true); dv.setFloat64(p + 8, r.v, true); dv.setFloat64(p + 16, r.w, true); dv.setInt32(p + 24, r.op === '>' ? 1 : 0, true); });
    const s = round6(run(body.rules.length));
    return { score: s, label: s > body.threshold ? 1 : 0 };
  } };
}

export async function prepare(name) {
  if (name === 'f64') return f64;
  if (name === 'int') return int;
  if (name === 'f32') return f32;
  if (name === 'wasm') return wasm();
  return null;
}

export const verdictOf = (substrate, body, x) => (substrate && typeof substrate.score === 'function' ? substrate.score(body, x) : null);
