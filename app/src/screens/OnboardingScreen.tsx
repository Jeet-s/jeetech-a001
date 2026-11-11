import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, FooterScreen, Icon, Tappable, feedback, palette, radius, space, type } from "../ui";
import { OptionChips } from "./kit";
import { mutate, today } from "../state";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { seedSamples, startFromScratch } from "../core/onboarding";
import { setCurrency } from "../core/prefs";
import { art } from "../art";

const START_CUR = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const todayKey = today();
  const finishing = useRef(false);
  const [path, setPath] = useState<"samples" | "scratch">("samples");
  const [currency, setCur] = useState("USD");

  useEffect(() => {
    analytics.track("onboarding_step", { step: 1 });
  }, []);

  const finish = (withSamples: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    mutate((prev) => {
      let st = setCurrency(prev, currency);
      if (withSamples) {
        st = seedSamples(st, todayKey);
      } else {
        st = startFromScratch(st);
      }
      return st;
    });
    store.set({ onboarded: true });
    analytics.track("onboarding_done", { samples: withSamples });
    feedback("success", "success");
    onDone();
  };

  return (
    <FooterScreen footer={
      <>
        <Button label="Start tracking" size="lg" icon="envelope" onPress={() => finish(path === "samples")} />
        <Button label="Skip setup" variant="ghost" sound={null} style={{ borderWidth: 0 }} onPress={() => finish(false)} />
      </>
    }>
      <View style={styles.body}>
        <Image source={art.onboarding_1_welcome} style={styles.hero} resizeMode="contain" />
        <Text style={[type.title, styles.center]}>Log your first purchase</Text>
        <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
          Tap Add expense, enter the amount and save. No sign-in or bank links required.
        </Text>
        <View style={{ gap: 6 }}>
          <Text style={[type.label, styles.center]}>Currency</Text>
          <OptionChips options={START_CUR.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCur} />
          <Text style={[type.caption, styles.center]}>Change it anytime in Settings.</Text>
        </View>
        <View style={{ gap: space.sm }}>
          <ChoiceCard
            icon="star"
            title="Use sample envelopes"
            body="Groceries, Fuel and Eating Out with editable example budgets."
            selected={path === "samples"}
            onPress={() => setPath("samples")}
          />
          <ChoiceCard
            icon="envelope"
            title="Start from scratch"
            body="Name your first envelope as you save a purchase."
            selected={path === "scratch"}
            onPress={() => setPath("scratch")}
          />
        </View>
      </View>
    </FooterScreen>
  );
}

function ChoiceCard({ icon, title, body, selected, onPress }: { icon: "star" | "envelope"; title: string; body: string; selected: boolean; onPress: () => void }) {
  return (
    <Tappable label={title} role="checkbox" accessibilityState={{ checked: selected }} sound="pop" onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <View style={[styles.choiceIcon, selected && { backgroundColor: palette.primary }]}>
        <Icon name={icon} size={20} color={selected ? palette.onPrimary : palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong}>{title}</Text>
        <Text style={type.caption}>{body}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="check" size={14} color={palette.onPrimary} /> : null}</View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  hero: { width: "100%", height: 80, alignSelf: "center" },
  center: { textAlign: "center" },
  choice: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1.5, borderColor: palette.border },
  choiceOn: { borderColor: palette.primary },
  choiceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: palette.primary, borderColor: palette.primary },
});
