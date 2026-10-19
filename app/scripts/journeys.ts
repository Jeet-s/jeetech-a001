/// <reference types="node" />
/**
 * FACTORY-OWNED — do not edit (overwritten on every build).
 * Journey bots through the app's real core logic (src/core/sim.ts):
 *  - focused users: breadth-first search for the SHORTEST action sequence that
 *    reaches each goal from a fresh install (what a user who knows what they
 *    want would do; QA fails flows that take too many steps);
 *  - careless users: seeded random sessions that check every step for crashes,
 *    broken invariants, save → restore round-trips and dead ends.
 * Last stdout line (JSON):
 *   {"goals": [{"id", "name", "reached", "steps"}], "fuzz": {"sessions", "actions", "errors": [..],
 *    "invariant_violations": [..], "roundtrip_failures": n, "dead_ends": n}}
 */
import { sim } from "../src/core/sim";

const MAX_DEPTH = Number(process.env.JOURNEY_SEARCH_DEPTH ?? 16);
const MAX_NODES = Number(process.env.JOURNEY_MAX_NODES ?? 150_000);
const SESSIONS = Number(process.env.FUZZ_SESSIONS ?? 30);
const STEPS = Number(process.env.FUZZ_STEPS ?? 250);

type S = ReturnType<typeof sim.init>;
type A = ReturnType<typeof sim.actions>[number];

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const short = (v: unknown) => JSON.stringify(v).slice(0, 160);

function shortest(goal: (s: S) => boolean): number | null {
  const start = sim.init();
  if (goal(start)) return 0;
  const seen = new Set<string>([sim.serialize(start)]);
  let frontier: S[] = [start];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
    const next: S[] = [];
    for (const s of frontier) {
      for (const a of sim.actions(s)) {
        let n: S;
        try {
          n = sim.apply(s, a);
        } catch {
          continue; // crashes are reported by the fuzzer
        }
        if (goal(n)) return depth;
        const key = sim.serialize(n);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(n);
        if (seen.size > MAX_NODES) return null;
      }
    }
    frontier = next;
  }
  return null;
}

const goals = sim.goals.map((g) => {
  const steps = shortest((s) => g.done(s));
  return { id: g.id, name: g.name, reached: steps !== null, steps };
});

const errors: string[] = [];
const invariant_violations: string[] = [];
let roundtrip_failures = 0;
let dead_ends = 0;
let actions = 0;
for (let k = 0; k < SESSIONS; k++) {
  const rand = rng(1000 + k * 7919);
  let s: S = sim.init();
  for (let i = 0; i < STEPS; i++) {
    const options = sim.actions(s);
    if (!options.length) {
      dead_ends++;
      break;
    }
    const a: A = options[Math.floor(rand() * options.length)];
    actions++;
    try {
      s = sim.apply(s, a);
    } catch (e) {
      if (errors.length < 20) errors.push(`${short(a)} → ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      break;
    }
    for (const v of sim.invariants(s)) if (invariant_violations.length < 20) invariant_violations.push(`after ${short(a)}: ${v}`);
    if (i % 10 === 0) {
      try {
        const raw = sim.serialize(s);
        if (sim.serialize(sim.deserialize(raw)) !== raw) roundtrip_failures++;
      } catch {
        roundtrip_failures++;
      }
    }
  }
}

console.log(JSON.stringify({ goals, fuzz: { sessions: SESSIONS, actions, errors, invariant_violations, roundtrip_failures, dead_ends } }));
