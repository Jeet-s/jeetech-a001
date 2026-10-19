import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, Confetti, Icon, Sheet, feedback, palette, radius, space, toast, type } from "../ui";
import { iap } from "../modules/iap";
import { useSettings } from "../modules/store";
import { analytics } from "../modules/analytics";
import { art } from "../art";

const PERKS = [
  "Advanced reports — compare months & trends",
  "Bulk edit — change many transactions at once",
  "Multiple budgets (separate books)",
  "Extra themes & PDF-ready exports",
  "No ads, ever — one payment, no subscription",
];

/** The Pro offer. Opened from a locked feature or Settings; `from` is tracked. */
export function ProSheet({ visible, from, onClose }: { visible: boolean; from: string; onClose: () => void }) {
  const { pro, adsRemoved } = useSettings();
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (visible) analytics.track("paywall_view", { from });
  }, [visible, from]);
  useEffect(() => {
    // A real milestone: celebrate the unlock, then let the sheet dismiss itself.
    if (pro && visible) {
      feedback("unlock", "success");
      setBurst((b) => b + 1);
      const t = setTimeout(onClose, 1300);
      return () => clearTimeout(t);
    }
  }, [pro, visible, onClose]);
  const buy = async (sku: string) => {
    setBusy(true);
    try {
      await iap.purchase(sku);
    } catch {
      feedback("error", "light");
      toast("Couldn't complete the purchase. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    const n = await iap.restore().catch(() => 0);
    feedback(n ? "success" : "pop", n ? "success" : "light");
    toast(n ? "Purchases restored" : "Nothing to restore yet");
  };

  return (
    <Sheet visible={visible} title="Envelope Mini Pro" onClose={onClose}>
      <Image source={art.pro_sheet_hero} style={styles.hero} resizeMode="cover" />
      <View style={{ gap: space.sm }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <View style={styles.tick}><Icon name="check" size={15} color={palette.success} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>
      <Button
        label={`Unlock Pro${iap.price("pro_unlock") ? ` · ${iap.price("pro_unlock")}` : ""}`}
        size="lg"
        icon="star"
        loading={busy}
        onPress={() => buy("pro_unlock")}
      />
      <Text style={[type.caption, { textAlign: "center" }]}>One-time purchase · all core budgeting stays free</Text>
      {!adsRemoved ? (
        <Button label={`Just remove ads${iap.price("remove_ads") ? ` · ${iap.price("remove_ads")}` : ""}`} variant="ghost" loading={busy} onPress={() => buy("remove_ads")} />
      ) : null}
      <Button label="Already bought it? Restore purchases" variant="ghost" size="sm" sound="pop" style={styles.restore} onPress={restore} />
      <Confetti trigger={burst} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 132, borderRadius: radius.lg, backgroundColor: palette.primary },
  restore: { borderWidth: 0 },
  perk: { flexDirection: "row", alignItems: "center", gap: space.md },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.successSoft, alignItems: "center", justifyContent: "center" },
});
