/**
 * Design tokens. Every screen uses these — never raw colours, sizes or system
 * fonts. The builder re-skins an app by editing `palette` (from the art bible /
 * PRD visual direction), not by hard-coding styles in components.
 */
export const palette = {
  // Brand
  primary: "#4F46E5",
  primaryDark: "#3730A3",
  primarySoft: "#EEF2FF",
  accent: "#EC4899",
  success: "#16A34A",
  successSoft: "#DCFCE7",
  warning: "#F59E0B",
  warningSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  // Surfaces
  bg: "#F6F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F3F9",
  border: "#E4E7EF",
  // Text
  ink: "#0F172A",
  inkSoft: "#475569",
  inkMuted: "#94A3B8",
  onPrimary: "#FFFFFF",
  // Overlays
  scrim: "rgba(15,23,42,0.45)",
};

/**
 * Hero gradient (top-left → bottom-right) for the ONE headline card per screen (HeroCard).
 * Re-skin it together with `primary` — two close hues read premium, a rainbow reads cheap.
 */
export const gradient = { hero: ["#6366F1", "#4338CA"] as [string, string], onHero: "#FFFFFF", onHeroSoft: "rgba(255,255,255,0.78)" };

/**
 * Categorical colours for charts, categories and tags — distinct from the status colours
 * (success/warning/danger mean state, never "category 3"). Same order everywhere.
 */
export const categorical = ["#6366F1", "#0EA5E9", "#F59E0B", "#EC4899", "#10B981", "#8B5CF6", "#F97316", "#14B8A6"];

/** Semantic tone → [strong, soft] colours. Use for pills, progress, amounts and banners. */
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

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Minimum touch target (Android guideline: 48dp). */
export const TOUCH = 48;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: palette.ink },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: palette.ink },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: palette.ink },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: palette.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: palette.inkSoft },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.inkMuted },
  button: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: 0.1 },
  number: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.5, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Hero figure (balance, total, streak) — one per screen. */
  hero: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  /** Money / quantities inside rows: tabular so columns of figures line up. */
  amount: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: palette.ink, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" as const, color: palette.inkSoft },
};

/** Soft elevation for cards and floating buttons (iOS + Android). */
export const shadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
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
};
export const durations = { fast: 140, base: 220, slow: 360 };
