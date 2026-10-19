import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
} from "expo-iap";
import { Linking } from "react-native";
import monetization from "../../monetization.json";
import product from "../../product.json";
import { store } from "./store";
import { analytics } from "./analytics";
import { cloud } from "./cloud";

/**
 * Google Play Billing via expo-iap. Products are defined in monetization.json
 * and created in Play Console by the factory's publisher (same SKUs):
 *   iap[]           one-time: pro_unlock (lifetime Pro, no ads), remove_ads
 *   subscriptions[] optional: e.g. pro_monthly / pro_yearly (with a free trial) —
 *                   only when the app has AI or cloud sync (ongoing value + cost)
 * Pro from a subscription lasts while the subscription is active; restore()
 * (run at boot) re-checks it. With cloud on, every purchase is also verified on
 * the server, which is what unlocks higher AI quotas / Pro-only cloud saving.
 */
type Sku = { sku: string; consumable: boolean };
type Plan = { sku: string; period: "P1M" | "P1Y"; priceUsd: number; trialDays: number };
const catalog: Sku[] = monetization.iap;
const plans: Plan[] = ((monetization as { subscriptions?: Plan[] }).subscriptions ?? []);
const bySku = new Map(catalog.map((p) => [p.sku, p]));
const planSkus = new Set(plans.map((p) => p.sku));

export interface ShopItem {
  sku: string;
  title: string;
  price: string;
}
export interface PlanItem extends ShopItem {
  period: "P1M" | "P1Y";
  /** Free-trial days the user is eligible for (0 if none). */
  trialDays: number;
  offerToken: string | null;
}

let connected = false;
let items: ShopItem[] = [];
let planItems: PlanItem[] = [];

/** pro_unlock → lifetime Pro (also removes ads); remove_ads → no ads; a plan → Pro while active. */
function entitle(sku: string): void {
  if (sku === "pro_unlock") store.set({ pro: true, adsRemoved: true, proSource: "lifetime" });
  if (sku === "remove_ads") store.set({ adsRemoved: true });
  if (planSkus.has(sku) && store.get().proSource !== "lifetime") store.set({ pro: true, adsRemoved: true, proSource: "subscription" });
}

function verifyOnServer(p: Purchase): void {
  const token = (p as { purchaseToken?: string | null }).purchaseToken;
  if (!token) return;
  void cloud.verifyPurchase({ token, sku: p.productId, kind: planSkus.has(p.productId) ? "subscription" : "one_time" });
}

function grant(p: Purchase): void {
  if (!bySku.has(p.productId) && !planSkus.has(p.productId)) return;
  entitle(p.productId);
  verifyOnServer(p);
  analytics.track("iap_purchase", { sku: p.productId });
}

const trialOf = (offer: { pricingPhasesAndroid?: unknown; displayPrice?: string; id?: string }): number => {
  const m = /trial-(\d+)d/.exec(String(offer.id ?? ""));
  return m ? Number(m[1]) : 0;
};

export const iap = {
  async init(): Promise<void> {
    try {
      connected = await initConnection();
      if (!connected) return;
      purchaseUpdatedListener(async (p) => {
        grant(p);
        const def = bySku.get(p.productId);
        await finishTransaction({ purchase: p, isConsumable: !!def?.consumable }).catch(() => {});
      });
      purchaseErrorListener((e) => {
        if (__DEV__) console.warn("[iap] purchase error", e);
      });
      const products = (await fetchProducts({ skus: catalog.map((p) => p.sku), type: "in-app" })) ?? [];
      items = products.map((p) => ({ sku: p.id, title: p.title, price: p.displayPrice }));
      if (plans.length) {
        const subs = ((await fetchProducts({ skus: plans.map((p) => p.sku), type: "subs" })) ?? []) as {
          id: string;
          title: string;
          displayPrice: string;
          subscriptionOffers?: { id?: string; displayPrice: string; offerTokenAndroid?: string | null }[];
        }[];
        planItems = subs.map((s) => {
          const offers = s.subscriptionOffers ?? [];
          // Prefer the free-trial offer when the user is eligible (Play only returns offers they can use).
          const trial = offers.find((o) => trialOf(o) > 0);
          const base = offers.find((o) => trialOf(o) === 0) ?? offers[0];
          const pick = trial ?? base;
          const plan = plans.find((p) => p.sku === s.id)!;
          return {
            sku: s.id,
            title: s.title,
            price: base?.displayPrice ?? s.displayPrice,
            period: plan?.period ?? "P1M",
            trialDays: trial ? trialOf(trial) : 0,
            offerToken: pick?.offerTokenAndroid ?? null,
          };
        });
      }
      await iap.restore();
    } catch (e) {
      if (__DEV__) console.warn("[iap] init failed", e);
    }
  },

  items(): ShopItem[] {
    return items;
  },

  /** Subscription plans the store returned (empty when the app has none). */
  plans(): PlanItem[] {
    return planItems;
  },

  /** Localized price for a SKU, if the store has loaded it. */
  price(sku: string): string | null {
    return items.find((i) => i.sku === sku)?.price ?? planItems.find((i) => i.sku === sku)?.price ?? null;
  },

  async purchase(sku: string): Promise<void> {
    if (!connected) return;
    await requestPurchase({ request: { google: { skus: [sku] } }, type: "in-app" });
  },

  /** Start a subscription (uses the free-trial offer when the user is eligible). */
  async subscribe(sku: string): Promise<void> {
    if (!connected) return;
    const plan = planItems.find((p) => p.sku === sku);
    if (!plan?.offerToken) return;
    analytics.track("subscribe_start", { sku });
    await requestPurchase({
      request: { google: { skus: [sku], subscriptionOffers: [{ sku, offerToken: plan.offerToken }] } },
      type: "subs",
    });
  },

  /** Play's own screen to cancel / change a subscription (policy: must be easy to find). */
  manageSubscriptions(sku?: string): void {
    const q = sku ? `?sku=${sku}&package=${product.package}` : "";
    Linking.openURL(`https://play.google.com/store/account/subscriptions${q}`).catch(() => {});
  },

  /** Re-grant purchases on reinstall / new device and expire lapsed subscriptions. Returns how many were found. */
  async restore(): Promise<number> {
    if (!connected) return 0;
    const owned = (await getAvailablePurchases()) ?? [];
    for (const p of owned) {
      entitle(p.productId);
      verifyOnServer(p);
    }
    const activeSub = owned.some((p) => planSkus.has(p.productId));
    if (store.get().proSource === "subscription" && !activeSub)
      store.set({ pro: false, proSource: undefined, adsRemoved: owned.some((p) => p.productId === "remove_ads") });
    return owned.length;
  },
};
