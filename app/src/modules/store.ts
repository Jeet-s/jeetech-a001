import { persisted, usePersisted } from "./persist";

/**
 * App settings + entitlements (factory-owned shape — extend, don't remove
 * fields). The app's own data lives in its own persisted() store (src/core).
 */
export interface AppSettings {
  /** Pro (lifetime pro_unlock, or an active subscription). Pro also removes ads. */
  pro: boolean;
  /** Where Pro came from — a lapsed subscription removes Pro, a lifetime unlock never does. */
  proSource?: "lifetime" | "subscription";
  adsRemoved: boolean;
  onboarded: boolean;
  /** Number of app launches — ads and prompts wait for returning users. */
  sessions: number;
  /** UI sounds are subtle and default OFF for utility apps; haptics default on. */
  sound?: boolean;
  haptics?: boolean;
}

const settings = persisted<AppSettings>("app_settings_v1", {
  pro: false,
  adsRemoved: false,
  onboarded: false,
  sessions: 0,
  sound: false,
  haptics: true,
});

export const store = {
  load: () => settings.load(),
  get: () => settings.get(),
  set: (patch: Partial<AppSettings>) => settings.set((s) => ({ ...s, ...patch })),
  subscribe: settings.subscribe,
  reset: settings.reset,
};

export const useSettings = () => usePersisted(settings);
