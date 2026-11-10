---
name: envelope-mini-activation
description: First-use activation friction in Envelope Mini and the maintenance fix
metadata:
  type: project
---

Envelope Mini's previous onboarding directed users to a per-envelope plus button that the list did not render, after requiring budget and rollover configuration before any expense. The maintenance fix uses two skippable setup screens, keeps budget/rollover editing in envelope details, and puts labelled Add expense / Create first envelope actions in the home hero. The existing floating Add expense action remains available. Save expense / Save deposit labels match the guidance.

Home derives a lasting saved-entry result and a gentle daily check-in from existing transactions through `src/core/checkin.ts`. No state fields, persistence keys or schema versions changed. Deleted entries, transfers and automatic recurring postings do not count as manual check-ins. Analytics event names and the successful-save core_action calls remain unchanged.

Follow-up maintenance (2026-11-10): the transaction sheet separately sized its scroll area to 66% of the window, then added a header, preview, Save and secondary actions. On a 640dp-tall phone these can exceed the window; entering an amount also added preview height and moved Save. `Sheet` now accepts a fixed footer via an embedded `FooterScreen`, bounds the form to the safe viewport and subtracts actual keyboard overlap (including resized Android windows). The transaction sheet uses that footer for the reserved preview/error area and Save, while split/duplicate/delete remain in the scrolling body. The selected envelope is named before entry; preview rows wrap for large amounts or long names. Other sheets keep their existing layout. Native/device visual verification is pending.

Validation: TypeScript passed; validate 173/173; journeys 6/6 goals in 1–3 abstract actions, 7,500 fuzz actions with zero errors, invariant violations, round-trip failures or dead ends; pitfalls zero errors or warnings. Native build/device QA remains with the factory. Activation improvement must be measured from live telemetry after release; these checks do not establish the 60% target.
