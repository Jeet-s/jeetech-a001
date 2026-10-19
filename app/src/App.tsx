import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn } from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { EnvelopesScreen } from "./screens/EnvelopesScreen";
import { TransactionsScreen } from "./screens/TransactionsScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { RecurringScreen } from "./screens/RecurringScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ProSheet } from "./screens/ProSheet";
import { LockScreen } from "./screens/security";
import { SheetsProvider } from "./screens/sheets_provider";
import { TAB_BAR_HEIGHT, TabBar, ToastHost, initAudio, palette, toast, type IconName } from "./ui";
import { analytics } from "./modules/analytics";
import { layout, useBannerHeight } from "./modules/layout";
import { ads } from "./modules/ads";
import { iap } from "./modules/iap";
import { store, useSettings } from "./modules/store";
import { budgetStore, useBudget } from "./core/data";
import { postDueOnOpen, today } from "./state";
import { shouldLock } from "./core/prefs";
import { ScreenshotScene } from "./screenshots";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    Linking.getInitialURL()
      .then((u) => setShot(u?.match(/shot\/([\w-]+)/)?.[1] ?? null))
      .catch(() => setShot(null));
    Promise.all([store.load(), budgetStore.load()]).finally(() => setLoaded(true));
  }, []);
  const ready = fontsLoaded && loaded && shot !== undefined;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return <View style={styles.root} />;
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {shot ? <ScreenshotScene id={shot} /> : <Main />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type Tab = "envelopes" | "transactions" | "reports" | "recurring" | "settings";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "envelopes", label: "Envelopes", icon: "envelope" },
  { id: "transactions", label: "Activity", icon: "list" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "recurring", label: "Recurring", icon: "repeat" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function Main() {
  const settings = useSettings();
  const budget = useBudget();
  const insets = useSafeAreaInsets();
  const banner = useBannerHeight();
  const [showBanner, setShowBanner] = useState(false);
  const [tab, setTab] = useState<Tab>("envelopes");
  // Skeleton the envelope list for a beat right after onboarding so the first
  // frame reads as "loading your envelopes", never a blank screen.
  const [booting, setBooting] = useState(false);
  const [pro, setPro] = useState<string | null>(null);
  const [locked, setLocked] = useState(() => budgetStore.get().prefs.security.pinEnabled);
  const bgAt = useRef(0);
  // The first screen after onboarding should appear instantly (no fade-from-blank);
  // tab-to-tab switches afterwards still cross-fade.
  const tabsSeen = useRef(false);

  useEffect(() => {
    store.set({ sessions: store.get().sessions + 1 });
    analytics.track("app_open");
    const posted = postDueOnOpen(today());
    if (posted > 0) setTimeout(() => toast(`Posted ${posted} recurring ${posted > 1 ? "items" : "item"} due today`), 500);
    (async () => {
      await initAudio();
      await ads.init();
      setShowBanner(ads.canShowBanner());
      await iap.init();
    })();
    return store.subscribe(() => setShowBanner(ads.canShowBanner()));
  }, []);

  // App lock: re-lock after the configured background timeout.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "background" || st === "inactive") {
        bgAt.current = Date.now();
      } else if (st === "active" && bgAt.current) {
        const secs = (Date.now() - bgAt.current) / 1000;
        if (shouldLock(budgetStore.get().prefs, secs)) setLocked(true);
        bgAt.current = 0;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!showBanner) layout.setBannerHeight(0);
  }, [showBanner]);
  useEffect(() => {
    if (settings.onboarded) analytics.track("screen_view", { screen: tab });
  }, [tab, settings.onboarded]);
  useEffect(() => {
    if (!settings.onboarded) return;
    const t = setTimeout(() => { tabsSeen.current = true; }, 220);
    return () => clearTimeout(t);
  }, [settings.onboarded]);
  const openPro = useCallback((from: string) => setPro(from), []);
  const closePro = useCallback(() => setPro(null), []);

  if (!settings.onboarded)
    return (
      <OnboardingScreen
        onDone={() => {
          setTab("envelopes");
          setBooting(true);
          setTimeout(() => setBooting(false), 600);
        }}
      />
    );
  if (locked && budget.prefs.security.pinEnabled) return <LockScreen onUnlock={() => setLocked(false)} />;

  const bottom = TAB_BAR_HEIGHT;
  return (
    <SheetsProvider>
      <View style={styles.root}>
        <Animated.View key={tab} entering={tabsSeen.current ? FadeIn.duration(160) : undefined} style={styles.root}>
          {tab === "envelopes" ? (
            <EnvelopesScreen bottomInset={bottom} onPro={openPro} booting={booting} />
          ) : tab === "transactions" ? (
            <TransactionsScreen bottomInset={bottom} onPro={openPro} />
          ) : tab === "reports" ? (
            <ReportsScreen bottomInset={bottom} onPro={openPro} />
          ) : tab === "recurring" ? (
            <RecurringScreen bottomInset={bottom} onPro={openPro} />
          ) : (
            <SettingsScreen bottomInset={bottom} onPro={openPro} />
          )}
        </Animated.View>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
        <ProSheet visible={!!pro} from={pro ?? ""} onClose={closePro} />
        <ToastHost bottom={TAB_BAR_HEIGHT + insets.bottom + banner + 12} />
        {showBanner && (
          <View style={styles.banner} onLayout={(e) => layout.setBannerHeight(e.nativeEvent.layout.height)}>
            <BannerAd unitId={ads.bannerUnitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
          </View>
        )}
      </View>
    </SheetsProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  banner: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", backgroundColor: palette.surface },
});
