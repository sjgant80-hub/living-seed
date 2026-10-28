// tools/organ-13.mjs — what organ 13's measurement (tools/measure-13.mjs) and the page's tab share, so that both grow
// exactly the same system: the owner's phrase (public here, so that anyone can reproduce the record; a real owner keeps
// theirs secret), the opening policy of the system's ledger, the fixed clock its ledger is stamped with, and the cases the
// fingerprint asks. Loads in a browser and in Node alike.
import { caseOf } from '../src/germinate.mjs';

export const PHRASE = 'the owner of this device, growing its system';
export const POLICY = Object.freeze({ makerPpm: 100000, lineagePpm: 0, earlyUntil: 40, earlyNum: 3, earlyDen: 2 });
export const CLOCK = '2026-10-28T12:00:00Z';
export const TAB_CASES = 25;
export const clock = () => new Date(CLOCK);

/** The first TAB_CASES held-out cases of each domain the device holds — cases no organ grew on. */
export const tabCases = (data) => Object.fromEntries(Object.keys(data).sort().map((d) => [d, data[d].heldRows.slice(0, TAB_CASES).map((i) => caseOf(data[d], i))]));
