import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, FooterScreen, Icon, Tappable, feedback, palette, radius, space, type } from "../ui";
import { OptionChips } from "./kit";
import { mutate, today } from "../state";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { seedSamples, startFromScratch } from "../core/onboarding";
import { setCurrency } from "../core/prefs";
import { art } from "../art";

const STEPS = 2;
const START_CUR = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const todayKey = today();
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<"samples" | "scratch">("samples");
  const [currency, setCur] = useState("USD");

  const go = (n: number) => {
    analytics.track("onboarding_step", { step: n });
    setStep(n);
  };

  const finish = (withSamples: boolean) => {
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

  const dots = (
    <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${STEPS}`}>
      {Array.from({ length: STEPS }).map((_, i) => (
        <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
      ))}
    </View>
  );

  const footer = (
    <>
      {step < STEPS - 1 ? (
        <Button label="Continue" size="lg" onPress={() => go(step + 1)} />
      ) : (
        <Button label="Open my envelopes" size="lg" icon="check" onPress={() => finish(path === "samples")} />
      )}
      <Button label="Skip setup" variant="ghost" sound={null} style={{ borderWidth: 0 }} onPress={() => finish(false)} />
    </>
  );

  return (
    <FooterScreen top={dots} footer={footer}>
      <View style={step === 1 ? styles.bodyTight : styles.body}>
        {step === 0 ? (
          <>
            <Image source={art.onboarding_1_welcome} style={styles.hero} resizeMode="contain" />
            <Text style={[type.display, styles.center]}>Budget by envelope</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              Choose an envelope, enter an amount and save. No sign-in or bank links required.
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { textAlign: "center" }]}>Currency</Text>
              <OptionChips options={START_CUR.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCur} />
              <Text style={[type.caption, { textAlign: "center" }]}>Used for all your budgets — change it anytime in Settings.</Text>
            </View>
          </>
        ) : (
          <>
            <Image source={art.onboarding_2_budgets} style={styles.heroSm} resizeMode="contain" />
            <Text style={[type.title, styles.center]}>How do you want to start?</Text>
            <View style={{ gap: space.sm }}>
              <ChoiceCard
                icon="star"
                title="Use sample envelopes"
                body="Groceries, Fuel and Eating Out with example budgets."
                selected={path === "samples"}
                onPress={() => setPath("samples")}
              />
              <ChoiceCard
                icon="envelope"
                title="Start from scratch"
                body="Just a Cash account — add your own envelopes."
                selected={path === "scratch"}
                onPress={() => setPath("scratch")}
              />
            </View>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              {path === "samples"
                ? "Next, tap Add expense on the home screen to log a purchase. You can change budgets and rollover anytime in envelope details."
                : "Next, create your first envelope, then tap Add expense to log a purchase. A Cash account is ready for you."}
            </Text>
          </>
        )}
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
  dots: { flexDirection: "row", gap: 6, alignSelf: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.border },
  dotOn: { width: 22, backgroundColor: palette.primary },
  body: { gap: space.lg },
  bodyTight: { gap: space.md },
  hero: { width: "100%", height: 200, alignSelf: "center" },
  heroSm: { width: "100%", height: 92, alignSelf: "center" },
  center: { textAlign: "center" },
  choice: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1.5, borderColor: palette.border },
  choiceOn: { borderColor: palette.primary },
  choiceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: "center", justifyContent: "center" },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: palette.border, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: palette.primary, borderColor: palette.primary },
});
