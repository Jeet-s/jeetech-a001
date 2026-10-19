/** Generated app art (assets/art/manifest.json has kind/usage/size for each). Use with expo Image or Skia useImage. */
export const art = {
  appicon_primary: require("../assets/art/appicon_primary.png"),
  splash_logo: require("../assets/art/splash_logo.png"),
  onboarding_1_welcome: require("../assets/art/onboarding_1_welcome.png"),
  onboarding_2_budgets: require("../assets/art/onboarding_2_budgets.png"),
  onboarding_3_speed_entry: require("../assets/art/onboarding_3_speed_entry.png"),
  empty_state_envelopes: require("../assets/art/empty_state_envelopes.png"),
  empty_state_transactions: require("../assets/art/empty_state_transactions.png"),
  empty_state_reports: require("../assets/art/empty_state_reports.png"),
  pro_sheet_hero: require("../assets/art/pro_sheet_hero.png"),
  ui_badge_achieved: require("../assets/art/ui_badge_achieved.png"),
} as const;
export type ArtId = keyof typeof art;
