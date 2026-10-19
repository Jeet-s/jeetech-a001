import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInRight, FadeOutLeft } from "react-native-reanimated";
import { Button, FooterScreen, Icon, Tappable, TextField, Toggle, feedback, palette, radius, space, type } from "../ui";
import { OptionChips } from "./kit";
import { mutate, today } from "../state";
import { store } from "../modules/store";
import { analytics } from "../modules/analytics";
import { SAMPLE_ENVELOPES, activeEnvelopes } from "../core/model";
import { seedSamples, startFromScratch } from "../core/onboarding";
import { setCurrency } from "../core/prefs";
import { setRollover } from "../core/envelopes";
import { setBudget } from "../core/budget";
import { periodFor } from "../core/dates";
import { parseAmount, formatMoney } from "../core/money";
import { art } from "../art";

const STEPS = 3;
const START_CUR = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const todayKey = today();
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<"samples" | "scratch">("samples");
  const [currency, setCur] = useState("USD");
  const [budgets, setBudgets] = useState<string[]>(SAMPLE_ENVELOPES.map((e) => String(e.planned)));
  const [rolls, setRolls] = useState<boolean[]>(SAMPLE_ENVELOPES.map((e) => e.rollover));

  const totalBudget = budgets.reduce((sum, b) => sum + (parseAmount(b, currency) ?? 0), 0);

  const go = (n: number) => {
    analytics.track("onboarding_step", { step: n });
    setStep(n);
  };

  const finish = (withSamples: boolean) => {
    mutate((prev) => {
      let st = setCurrency(prev, currency);
      if (withSamples) {
        st = seedSamples(st, todayKey);
        const period = periodFor(todayKey, st.prefs.period);
        const envs = activeEnvelopes(st);
        SAMPLE_ENVELOPES.forEach((sample, i) => {
          const env = envs.find((e) => e.name === sample.name);
          if (!env) return;
          st = setBudget(st, env.id, period, parseAmount(budgets[i], st.prefs.currency) ?? 0);
          st = setRollover(st, env.id, rolls[i]);
        });
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
        <Button label="Start budgeting" size="lg" icon="check" onPress={() => finish(path === "samples")} />
      )}
      {step === 0 ? <Button label="Skip" variant="ghost" sound={null} style={{ borderWidth: 0 }} onPress={() => finish(false)} /> : null}
    </>
  );

  return (
    <FooterScreen top={dots} footer={footer}>
      <Animated.View key={step} entering={FadeInRight.duration(240)} exiting={FadeOutLeft.duration(140)} style={step === 1 ? styles.bodyTight : styles.body}>
        {step === 0 ? (
          <>
            <Image source={art.onboarding_1_welcome} style={styles.hero} resizeMode="contain" />
            <Text style={[type.display, styles.center]}>Budget by envelope</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              Add an expense or deposit in one tap. No account, no bank links — everything stays on your phone.
            </Text>
            <View style={{ gap: 6 }}>
              <Text style={[type.label, { textAlign: "center" }]}>Currency</Text>
              <OptionChips options={START_CUR.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCur} />
              <Text style={[type.caption, { textAlign: "center" }]}>Used for all your budgets — change it anytime in Settings.</Text>
            </View>
          </>
        ) : step === 1 ? (
          <>
            <Image source={art.onboarding_2_budgets} style={styles.heroSm} resizeMode="contain" />
            <Text style={[type.title, styles.center]}>How do you want to start?</Text>
            <View style={{ gap: space.sm }}>
              <ChoiceCard
                icon="star"
                title="Use sample envelopes"
                body="Groceries, Fuel and Eating Out, ready to tweak."
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
            {path === "samples" ? (
              <View style={styles.budgetList}>
                {SAMPLE_ENVELOPES.map((sample, i) => (
                  <View key={sample.name} style={styles.budgetRow}>
                    <View style={[styles.sampleDot, { backgroundColor: sample.color }]} />
                    <Text style={[type.bodyStrong, { flex: 1 }]} numberOfLines={1}>{sample.name}</Text>
                    <TextField
                      label=""
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      placeholder="0"
                      accessibilityLabel={`${sample.name} monthly budget`}
                      value={budgets[i]}
                      onChangeText={(t) => setBudgets((b) => b.map((x, j) => (j === i ? t : x)))}
                      style={{ width: 84, textAlign: "right" }}
                    />
                    <Toggle label="" accessibilityLabel={`Roll over ${sample.name}`} value={rolls[i]} onChange={(v) => setRolls((r) => r.map((x, j) => (j === i ? v : x)))} />
                  </View>
                ))}
                <View style={styles.budgetTotal}>
                  <Text style={[type.caption, { flex: 1 }]}>Set a monthly budget; the switch rolls leftovers over.</Text>
                  <Text style={[type.label, { color: palette.primary }]} numberOfLines={1}>{formatMoney(totalBudget, currency)}/mo</Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Image source={art.onboarding_3_speed_entry} style={styles.hero} resizeMode="contain" />
            <Text style={[type.title, styles.center]}>You're all set</Text>
            <Text style={[type.body, styles.center, { color: palette.inkSoft }]}>
              On the envelope list, tap the add button on any envelope to log an expense or deposit — one tap, no forms to fill.
            </Text>
            <Text style={[type.caption, styles.center]}>
              {path === "samples"
                ? "Your sample envelopes and a Cash account are ready to go."
                : "A Cash account is ready — add your first envelope whenever you like."}
            </Text>
          </>
        )}
      </Animated.View>
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
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="check" size={14} color="#fff" /> : null}</View>
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
  budgetList: { gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.md },
  budgetRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48 },
  budgetTotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: space.xs },
  sampleDot: { width: 12, height: 12, borderRadius: 6 },
});
