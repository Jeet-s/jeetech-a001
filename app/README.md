# React Native app runtime

Base template for every app the factory builds (Expo SDK 58). The Claude Code
builder clones it into a run workspace, replaces the tokens (`Envelope Mini — Manual Budget Envelopes`,
`com.appfactory.envelopeminimanualbudgetenvelopes`, …) and replaces the **showcase habit tracker** with the
app described by the PRD — keeping the infrastructure:

| Path | What | Owner |
| --- | --- | --- |
| `src/ui` | product UI kit (theme tokens, Screen, Card, Button, TextField, Sheet, Toast, ProgressRing, BarChart, TabBar, Skia icons) | extend |
| `src/core` | pure-TS domain logic + `persisted()` stores + `sim.ts` | builder replaces |
| `src/screens` | screens built from the kit | builder replaces |
| `src/modules/{ads,iap,store,analytics,persist,layout}.ts` | monetization, entitlements, telemetry, persistence | factory (keep) |
| `scripts/validate.ts` | core-logic tests → `{"tests","passed","failures","features"}` | builder replaces |
| `scripts/journeys.ts` | journey bots over `src/core/sim.ts` | factory (overwritten) |
| `shots.json` + `src/screenshots.tsx` | Play Store screenshot scenes (`<scheme>://shot/<id>`) | builder |
| `monetization.json` | AdMob ids + IAP SKUs (`pro_unlock`, `remove_ads`) | factory (per slot) |

```bash
npm run validate     # core-logic tests
npm run journeys     # journey bots (goals reachable, fuzz clean)
npx tsc --noEmit
npx expo prebuild --platform android && npm run build:android   # .aab
```

Analytics event contract (QA and the live funnel depend on it):
`app_open`, `onboarding_step {step}`, `onboarding_done`, `core_action {feature}`,
`screen_view {screen}`, `paywall_view {from}`, `iap_purchase {sku}`.
