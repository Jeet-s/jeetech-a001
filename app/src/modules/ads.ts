import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from "react-native-google-mobile-ads";
import monetization from "../../monetization.json";
import { store } from "./store";
import { analytics } from "./analytics";

/**
 * Production ad layer (AdMob). Policy-safe defaults the QA gate checks for:
 * - UMP consent gathered before any ad request (GDPR / US state privacy)
 * - utility apps lead with a small banner; interstitials are OFF by default and,
 *   if a PRD really wants them, only at a natural break AFTER a task is done —
 *   never on launch, never mid-task, heavily frequency-capped
 * - rewarded ads are always opt-in (e.g. "try a Pro feature for a day")
 * - Pro / remove_ads disables all ads
 */
const MIN_SECONDS_BETWEEN_INTERSTITIALS = 300;
// Users punish ads that interrupt the job they opened the app for (1★ reason #1 in utility reviews).
const MIN_BREAKS_BETWEEN_INTERSTITIALS = 6;
const FIRST_INTERSTITIAL_SESSION = 4;
const NO_BANNER_UNTIL_SESSION = 2;

const ids = monetization.admob;
let ready = false;
let lastInterstitialAt = Date.now() / 1000; // grace period after launch
let breaksSinceInterstitial = 0;

const interstitial = InterstitialAd.createForAdRequest(ids.interstitial);
const rewarded = RewardedAd.createForAdRequest(ids.rewarded);
let interstitialLoaded = false;
let rewardedLoaded = false;

interstitial.addAdEventListener(AdEventType.LOADED, () => (interstitialLoaded = true));
interstitial.addAdEventListener(AdEventType.CLOSED, () => {
  interstitialLoaded = false;
  interstitial.load();
});
interstitial.addAdEventListener(AdEventType.ERROR, () => (interstitialLoaded = false));
rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => (rewardedLoaded = true));
rewarded.addAdEventListener(AdEventType.CLOSED, () => {
  rewardedLoaded = false;
  rewarded.load();
});
rewarded.addAdEventListener(AdEventType.ERROR, () => (rewardedLoaded = false));

export const ads = {
  bannerUnitId: ids.banner,

  /** Call once at boot, before showing any ad. */
  async init(): Promise<void> {
    try {
      await AdsConsent.gatherConsent();
      const { canRequestAds } = await AdsConsent.getConsentInfo();
      if (!canRequestAds) return;
      await mobileAds().initialize();
      ready = true;
      interstitial.load();
      rewarded.load();
    } catch (e) {
      if (__DEV__) console.warn("[ads] init failed", e);
    }
  },

  /** No banner in the first session or before onboarding: new users judge the app in its first minute. */
  canShowBanner(): boolean {
    const s = store.get();
    return ready && !s.adsRemoved && !s.pro && s.onboarded && s.sessions >= NO_BANNER_UNTIL_SESSION;
  },

  /** Only after a finished task (never mid-task). Returns true if an ad was shown. */
  showInterstitial(): boolean {
    breaksSinceInterstitial++;
    const s = store.get();
    if (!ready || s.adsRemoved || s.pro || !interstitialLoaded) return false;
    if (s.sessions < FIRST_INTERSTITIAL_SESSION) return false;
    const now = Date.now() / 1000;
    if (now - lastInterstitialAt < MIN_SECONDS_BETWEEN_INTERSTITIALS) return false;
    if (breaksSinceInterstitial < MIN_BREAKS_BETWEEN_INTERSTITIALS) return false;
    lastInterstitialAt = now;
    breaksSinceInterstitial = 0;
    analytics.track("ad_interstitial_shown");
    interstitial.show().catch(() => {});
    return true;
  },

  rewardedAvailable(): boolean {
    return ready && rewardedLoaded;
  },

  /** Opt-in only: call from a button the user pressed. */
  showRewarded(onReward: () => void): boolean {
    if (!ready || !rewardedLoaded) return false;
    const unsub = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      unsub();
      analytics.track("ad_rewarded_earned");
      onReward();
    });
    rewarded.show().catch(() => unsub());
    return true;
  },
};
