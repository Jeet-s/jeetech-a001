/**
 * Known QA pitfalls — FACTORY-OWNED, refreshed by the factory on every build pass (do not edit; fix the code it
 * reports). Each rule is a root cause that failed real device QA repeatedly across apps (ux_polish, feature_tour,
 * no_anr, layout_small, design_review). Catching them here costs seconds; finding them on the emulator costs a round.
 *
 *   npm run pitfalls            → a compact report (each rule's reason once + its file:line list); exits 1 on errors
 *   tsx scripts/pitfalls.ts --json → {"errors":[...],"warnings":[...]} (the factory's QA gate)
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

type Finding = { rule: string; file: string; line: number; why: string };
const args = process.argv.slice(2);
const json = args.includes("--json");
const dirArg = args.find((a) => !a.startsWith("--"));
const root = dirArg ? path.resolve(dirArg) : process.cwd();
const errors: Finding[] = [];
const warnings: Finding[] = [];

function files(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}
const lineOf = (src: string, idx: number) => src.slice(0, idx).split("\n").length;
const rel = (p: string) => path.relative(root, p);

const src = path.join(root, "src");
for (const file of files(src)) {
  // Comments are blanked out (same length, so line numbers still match): rules look at code and copy, not notes.
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, " "));
  const r = rel(file);
  const add = (list: Finding[], rule: string, idx: number, why: string) => list.push({ rule, file: r, line: lineOf(text, idx), why });

  // 1. Per-icon Skia canvases: blank icons in first frames + soak ANR (Floria, Band Up, Gully Score, Sugar Plate).
  if (/src\/ui\/Icon\.tsx$/.test(file) && /@shopify\/react-native-skia/.test(text))
    add(errors, "skia-icon", text.indexOf("@shopify/react-native-skia"), "Icon.tsx draws with Skia — render icons with react-native-svg (memoised)");

  // 2. Skia <Canvas> in a component that isn't memoised: redraws on every store change → soak ANR.
  if (/<Canvas[\s>]/.test(text) && !/\bmemo\(/.test(text))
    add(errors, "unmemoised-canvas", text.search(/<Canvas[\s>]/), "a Skia <Canvas> in a component not wrapped in React.memo — dozens of redraws per tap wedge the JS thread");

  // 3. Keyed `entering=` animations on remounting containers: stick at opacity 0 on Android → blank frames.
  for (const m of text.matchAll(/<Animated\.View\b[^>]*\bkey=\{[^}]+\}[^>]*\bentering=|<Animated\.View\b[^>]*\bentering=[^>]*\bkey=\{/g))
    add(warnings, "keyed-entering", m.index ?? 0, "a keyed Animated.View with `entering` (remounts each change) can stick blank on Android — use a plain View or animate the content inside");
  if (/src\/App\.tsx$/.test(file))
    for (const m of text.matchAll(/\bentering=\{/g))
      add(errors, "app-entering", m.index ?? 0, "an `entering` animation on an App-level container shows blank frames between screens — keep route/tab containers plain Views");

  // 4. Dead taps: an onPress that does nothing (feature_tour "taps had no visible effect").
  for (const m of text.matchAll(/onPress=\{\(\)\s*=>\s*\{\s*\}\}/g)) add(warnings, "dead-tap", m.index ?? 0, "onPress does nothing — wire it or remove the control");

  // 5. Promises the app can't keep (design_review / store policy).
  for (const m of text.matchAll(/["'`][^"'`\n]*\b(coming soon|no ads|ad-free(?! with Pro))\b[^"'`\n]*["'`]/gi))
    // "No ads" as a Pro / Remove Ads benefit is true; as an app-wide promise it is false while the free tier shows ads.
    if (/coming soon/i.test(m[1]) || !(/ProSheet|Paywall|Pro\b/.test(r) || /\b(pro|premium|upgrade|remove ads|go pro)\b/i.test(text.slice(Math.max(0, (m.index ?? 0) - 160), (m.index ?? 0) + 200))))
      add(errors, "false-claim", m.index ?? 0, `copy says "${m[1]}" — never promise unreleased features or "no ads" (say "ad-free with Pro")`);

  // 6. Bare touchables skip the factory's press feedback (ux_polish "no pressed state").
  for (const m of text.matchAll(/<(TouchableOpacity|TouchableWithoutFeedback|TouchableHighlight)\b/g))
    if (!/src\/ui\//.test(file)) add(warnings, "bare-touchable", m.index ?? 0, `${m[1]} — use Tappable / Button (press scale + dim + haptic) so every tap shows feedback`);

  // 7. High-frequency values in React state (mic level, timers < 100 ms) re-render the tree → soak ANR.
  for (const m of text.matchAll(/setInterval\([^,]+,\s*(\d{1,2})\)/g))
    if (Number(m[1]) < 100) add(warnings, "fast-interval", m.index ?? 0, `setInterval every ${m[1]} ms — drive fast animations with Reanimated shared values, not React state`);
  for (const m of text.matchAll(/on(Volume|Level)Change[^\n]*set[A-Z]\w*\(/g))
    add(warnings, "level-in-state", m.index ?? 0, "a live audio level goes through React state (~10+/s re-renders) — use a Reanimated shared value");

  // 8. Single-line long copy truncates on small phones (layout_small "text cut off with an ellipsis").
  for (const m of text.matchAll(/numberOfLines=\{1\}[^>]*>\s*([^<{]{34,})</g))
    add(warnings, "truncated-copy", m.index ?? 0, `long text in a single line ("${m[1].trim().slice(0, 30)}…") gets cut off on small phones — allow 2 lines or shorten`);
}

if (json) console.log(JSON.stringify({ errors, warnings }));
else {
  // Builder sessions re-read this on every later turn: say each rule's reason once, then where it hits.
  const section = (label: string, list: Finding[]) => {
    const rules = [...new Set(list.map((f) => f.rule))];
    return rules.map((rule) => {
      const hits = list.filter((f) => f.rule === rule);
      return `${label} [${rule}] ${hits[0].why}\n  at ${hits.map((f) => `${f.file}:${f.line}`).join(", ")}`;
    });
  };
  const lines = [...section("ERROR", errors), ...section("warn", warnings)];
  console.log(lines.length ? lines.join("\n") : "no known pitfalls");
}
process.exit(errors.length ? 1 : 0);
