# The Living Seed

**Live: https://sjgant80-hub.github.io/living-seed/** — every organ runs in your browser on the page, beside its sealed
rules, its verdict and how it works.

A signed genome of a few hundred bytes that grows a working, gated AI on each device from that device's own records,
offline. Every organ must prove itself on past cases it never trained on, or it is cut and answers ABSTAIN. It answers
with receipts, refuses unsigned or replayed messages before reading them, defends itself, audits its own claims against
what actually happens, remembers what it lived, and has children that travel as a picture.

It was built in twelve organs. Each was pre-registered (the rules, the predictions, what had been seen, and the hash of
every file that would measure, committed first), measured deterministically, judged by its own sealed rules, and proven
from git to have been sealed first. CI re-runs and re-judges every one on every push. A failed prediction is kept; a
failed property stays red.

<!-- geo:organs -->
| # | Organ | What it had to show | Sealed rules held | What happened |
|---|---|---|---|---|
| 1 | **Genome + germination** | A signed seed grows a working organism offline | 9 of 9 | 496 bytes grew four organs; 486 of 486 one-character changes refused |
| 2 | **Body** | Patterns that route and abstain; a 58-byte organ against language models and against classical models | 6 of 7 · 4 of 4 · 3 of 4 | beat every local model asked cold; tied the 14B shown 24 examples (lead 0.014, not significant); on 1,200 new sessions (organ 2b) a win, lead 0.028, bound 0.010; 18 million times faster (1.2 µs against 22.6 s an answer, on the same laptop); tied PageValues alone, logistic regression and boosted trees with 2,001 numbers (0.824 against 0.815) |
| 3 | **The gate** | Nothing unproven enters, is learned, or is passed on | 4 of 4 | 0 of 4,354 attacks admitted |
| 4 | **Variation + selection** | Self-improvement judged blind, allowed to fail | 4 of 6 · 3 of 6 | it fell on unseen cases; the gate is what keeps a loss out |
| 5 | **Breeding + the card** | A verified child; the organism travels as a picture | 8 of 8 | the child’s shop organ (0.828) beat both parents |
| 6 | **Self-powering** | Work done once, reused exactly | 4 of 4 | 0.71% of the sorts done, ×6.54 faster, the same result |
| 7 | **Self-model** | Its prediction of its own correctness beats its base rate | 4 of 4 | answering only where it rates itself ≥ 0.8: 79.9% → 93.0% right, on 66% of cases |
| 8 | **Mesh** | Devices link up, send each case to whichever does it best, grow specialists, keep working when one is lost | 7 of 7 · 3 of 6 · 3 of 6 | 96.5% of cases answered against 54.2% alone; an over-claimer found out (78.9% of late tasks to the honest node) |
| 9 | **Immune system** | Attacks make it stronger; it never turns on itself | 9 of 12 · 7 of 7 | signature checks 5,040 → 400; a stolen key revoked in its round; a takeover cut in its round |
| 10 | **Alignment** | It cannot act unproven or hide an act; its claims follow reality | 4 of 9 · 8 of 8 | 96 of 96 tampers caught; its claim lowered 0.829 → 0.775 when the shop delivered less |
| 11 | **The full organism** | One season end to end on two devices | 5 of 8 · 5 of 5 | every gate held; the October gain did not carry into November–December |
| 12 | **The three receipts** | Better on its own hardware; consistent on real devices; unbroken from outside | 20 of 22 over 7 nights | 7 nights: November–December 0.819 → 0.777 (origin → now), 1 adopted a change; the two-device instrument works; no outside attempt yet |
<!-- /geo:organs -->

Data: the shop domain is real (UCI Online Shoppers Purchasing Intention, Sakar & Kastro 2018, CC BY 4.0, 12,330
sessions); triage, water and crop are seed-library's synthetic test domains. The page says so wherever their numbers appear.

## Check it yourself

```
npm test                                   # every unit, page and policy test
node witness-all.mjs                       # the mutation gate: every kernel, broken line by line, must be caught
node tools/measure.mjs --check && node tools/judge.mjs --check && node tools/order.mjs     # organ 1
for n in 2 3 4 4b 5 6 7 8 8b 8c 9 9b 10 10b 11 11b; do
  node tools/measure-$n.mjs --check && node tools/judge-$n.mjs --check && node tools/order.mjs --organ $n
done
node tools/sealed-rerun.mjs --organ 2      # organ 2's record from the exact bytes it sealed (its order proof refuses on one file)
node tools/night.mjs run 1 --check && node tools/night.mjs judge 1 --check   # receipt (a), night by night
node tools/geo.mjs --check                 # the JSON-LD, llms.txt, this table and robots.txt are what the page gives
```

Two verdicts are expected not to pass clean: organ 11's (its K2 property over-claimed, kept red; CI pins that exact
verdict) and organ 2's order proof (src/germinate.mjs gained organ 6's opt-in hook after organ 2's seal; the sealed
re-run proves the record follows from the sealed bytes).

## Layout

- `src/` — the kernels: genome, germinate, body, gate, evolve, card, breed, recycle, psi, mesh, immune, align, organism
- `vendor/` — seed-library's ribosome and domains; the Ed25519 keys module (see NOTICE)
- `tools/` — for each organ its seal, measurement and judge; the order proof, the sealed re-run, the nightly receipt,
  the two-device receipt checker, the tally, the AI layer and the page's CSP pin
- `data/` — every seal, record and verdict, the nights, the receipts, and the source data
- `index.html` — the live page; it imports the kernels above, so what runs there is what the gate proves

The behaviour watch (organ 9) follows Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC —
"GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps," 2025 (open defensive prior art,
CC BY 4.0). The gate draws on Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "From GEP Stabilization to Dual-Map
Ethical Reasoning," Derivation v0.2 (a stable system can stabilize a wrong reference, so every organ is judged on cases
it never grew on), and the nights on his "Dream State Architecture: GEP-Guided Memory Consolidation and Entropy
Regulation in Artificial Consciousness Systems," 2025 (a night's work stays inert until a wake review judges it).
The rebound cost law follows break-it (sjgant80-hub/break-it).

Powered by the Konomi architecture, created by Thomas Frumkin. Supplied by AI Native Solutions
(https://www.ai-nativesolutions.com); support agreed per deployment. MIT licence — no licence fee.
