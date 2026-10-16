# The Living Seed

**Live: https://sjgant80-hub.github.io/living-seed/** — try it, read how it works, check the receipt, all on the page.

A 496-byte signed genome that grows a working, verified AI on whatever device it lands on — from that device's own records,
offline. Each organ must prove itself on past cases it never trained on, or it is cut and answers ABSTAIN. Change a single
byte of the genome and nothing grows.

This repository builds the Living Seed one organ at a time, each gated by a mutation witness and measured against rules
sealed before it runs. **Organ 1 — the genome and germination — is built and proven: 9 of 9 sealed rules held, both
predictions included.**

| | |
|---|---|
| the genome | 496 bytes, 4 organs, Ed25519-sealed, verified before parse, one canonical byte form |
| reproduces its source | held-out AUC 0.815265 / 0.952127 / 0.747656 / 0.753796 — exactly seed-library's sealed values |
| offline | 0 network calls over 5 germinations, the seal check included |
| tamper | 486 of 486 one-character changes refused |
| half the history (prediction) | every organ still live; worst AUC drift 0.0054 (sealed bound 0.03) |
| no signal (prediction) | shuffled shop labels → AUC 0.513084, organ cut, 4,725 / 4,725 abstain; other organs answer every case |
| mutation gate | `src/genome.mjs` 41/41 · `src/germinate.mjs` 28/28 — CLEAN 69/69, nothing baselined |

Data: the shop domain is real (UCI Online Shoppers, 12,330 sessions); triage, water and crop are seed-library's
synthetic test domains. Stated on the page wherever the numbers appear.

## Check it yourself

```
npm test                         # unit, page and policy tests
node witness-all.mjs             # mutation gate over the kernels
node tools/measure.mjs --check   # re-derives data/record.json byte for byte
node tools/judge.mjs --check     # re-judges it by the sealed rules
node tools/order.mjs             # proves from git the seal came first, on the code it pinned
```

The order: `102ae7a` sealed → `7cdb8c4` re-sealed before any number existed (the CSV had been pinned with Windows line
ends; disclosed in the seal) → `46a2a14` measured → `c501b28` judged. The sealed judge's own `--history` check is broken
(git's `--format` after `--`); it is left byte-identical to the seal and the order proof is `tools/order.mjs`.

## Layout

- `src/genome.mjs` — the genome: format, seal, open (verify before parse)
- `src/germinate.mjs` — germination Γ: grow each organ on the device's data, gate it, answer or abstain
- `vendor/` — seed-library's ribosome and domains; the Ed25519 keys module (see NOTICE)
- `tools/` — seal, measure, judge, order, and the page's CSP pin
- `data/` — the sealed pre-registration, the record, the verdict, the source data
- `index.html` — the live page; it imports the kernels above

Powered by the Konomi architecture, created by Thomas Frumkin. Supplied by AI Native Solutions
(https://www.ai-nativesolutions.com); support agreed per deployment. MIT licence — no licence fee.
