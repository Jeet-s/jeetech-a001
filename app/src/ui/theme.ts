/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The builder re-skins an app by editing `palette` (from the art bible /
 * PRD visual direction), not by hard-coding styles in components.
 */
export const palette = {
  // Brand — a fresh emerald→teal family (not a single heavy green) so the app
  // reads as one cohesive, modern system with a little more life. Ink stays
  // slate for text contrast.
  primary: "#0E8C6B", // Primary 600 — all primary actions & progress
  primaryDark: "#0B6B52", // Primary 700 — gradient top, pressed states
  primarySoft: "#DCF2EA", // tinted fill for soft buttons, icon tiles, tabs
  teal: "#0E9488", // teal accent — gradient tail, fresh secondary pops
  accent: "#10B981", // brighter emerald pop for charts & confetti
  success: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#F59E0B",
  warningSoft: "#FEF3C7",
  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  // Surfaces — a faint cool-mint wash under white cards gives the airy,
  // premium feel the heavy-grey background lacked.
  bg: "#F3F7F6",
  surface: "#FFFFFF",
  surfaceAlt: "#EDF2F1",
  border: "#E2E8F0",
  // Text
  ink: "#0F172A",
  inkSoft: "#475569",
  inkMuted: "#94A3B8",
  onPrimary: "#FFFFFF",
  // On a dark/gradient hero: white at tuned opacities so sub-labels stay AA.
  onGlass: "rgba(255,255,255,0.94)",
  onGlassSoft: "rgba(255,255,255,0.84)",
  glassFill: "rgba(255,255,255,0.16)",
  glassTrack: "rgba(255,255,255,0.22)",
  // A brighter mint for accents that sit on the deep emerald hero.
  mint: "#6EE7B7",
  // Overlays
  scrim: "rgba(15,23,42,0.5)",
};

/**
 * Gradient presets (diagonal, top-left → bottom-right). The brand hero sweeps
 * a bright emerald → deep teal so the big "left to spend" number reads as
 * premium and alive (two close hues, not a flat dark block); white text on the
 * teal tail still clears WCAG-AA. danger/amber variants cover overspent and
 * caution states.
 */
export const gradients = {
  brand: ["#12A174", "#0B7A70"] as readonly [string, string], // bright emerald → deep teal
  brandBright: ["#0E8C6B", "#34D399"] as readonly [string, string], // emerald → mint (charts)
  danger: ["#DC2626", "#F05252"] as readonly [string, string],
  amber: ["#B45309", "#F59E0B"] as readonly [string, string],
  ink: ["#0F172A", "#1E293B"] as readonly [string, string],
};

/**
 * The ONE headline card per screen (HeroCard) sweeps two close emerald hues.
 * `onHero`/`onHeroSoft` are the white tints for text on it (both clear AA on
 * the darker tail). Re-skin this together with `palette.primary`.
 */
export const gradient = {
  hero: ["#12A174", "#0B7A70"] as [string, string],
  onHero: "#FFFFFF",
  onHeroSoft: "rgba(255,255,255,0.86)",
};

/**
 * Categorical colours for charts, categories and tags — distinct from the
 * status colours (success/warning/danger mean state, never "category 3"). Same
 * order everywhere. Teal/emerald lead so charts stay on-brand, then spread.
 */
export const categorical = ["#0E9488", "#6366F1", "#F59E0B", "#EC4899", "#10B981", "#8B5CF6", "#F97316", "#0EA5E9"];

/** Semantic tone → { fg, bg } colours. Use for pills, progress, amounts and banners. */
export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
export const tones: Record<Tone, { fg: string; bg: string }> = {
  primary: { fg: palette.primary, bg: palette.primarySoft },
  success: { fg: palette.success, bg: palette.successSoft },
  warning: { fg: "#B45309", bg: palette.warningSoft },
  danger: { fg: palette.danger, bg: palette.dangerSoft },
  neutral: { fg: palette.inkSoft, bg: palette.surfaceAlt },
};

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

// 8pt-grid radii: small elements 12, large cards 16, hero/sheets 24.
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;

export const type = {
  // Oversized hero figure for the headline number on a card (e.g. left-to-spend).
  heroNumber: { fontFamily: fonts.bold, fontSize: 42, lineHeight: 46, letterSpacing: -1.2, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Alias kept in sync with the factory kit: the one hero figure per screen. */
  hero: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: palette.ink },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: palette.ink },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: palette.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: palette.inkSoft },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.inkMuted },
  button: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1 },
  number: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.5, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Money / quantities inside rows: tabular so columns of figures line up. */
  amount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" as const, color: palette.inkSoft },
};

/** Soft elevation for cards and floating buttons (subtle 10%-black, 10px blur). */
export const shadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export const shadowStrong = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

/** Motion presets — use these so every animation in the app feels consistent. */
export const springs = {
  press: { damping: 18, stiffness: 380, mass: 0.6 },
  pop: { damping: 12, stiffness: 240, mass: 0.7 },
  gentle: { damping: 20, stiffness: 160, mass: 1 },
  // Crisp, overshoot-free settle for sheets — fast enough to feel instant.
  snappy: { damping: 26, stiffness: 300, mass: 0.9 },
};
export const durations = { fast: 140, base: 220, slow: 360 };
