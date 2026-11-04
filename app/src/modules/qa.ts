import { Linking } from "react-native";

/**
 * FACTORY-OWNED. QA hooks for the factory's automated device test (owner, 2026-10-29: "QA speech hook").
 *
 * The QA emulator can't hear: pushing audio into its virtual mic crashes the emulator, so voice apps were only ever
 * reviewed on silence ("no speech heard" in every round). The device suite launches a speech app with
 * `<scheme>://agf-qa?speech=1`; from then on, for this app session only, the app's speech wrapper SIMULATES
 * recognition of a sample spoken answer (listening → interim words → final transcript) instead of the
 * native recognizer. Everything after recognition (scoring, UI, storage) runs for real.
 *
 * Harmless outside QA: nothing persists, and the only effect of the link is a sample transcript in your own app.
 */
export const QA_SPEECH_SAMPLE =
  "I think the best way to learn a new language is to practice every day. For example, when I moved to a new city, " +
  "I spoke with my neighbors each morning, and within a few months I felt much more confident. " +
  "That is why I believe daily practice matters more than long study sessions.";

let speech = false;

function handle(url: string | null | undefined) {
  if (url && /:\/\/agf-qa\b[^#]*[?&]speech=1\b/.test(url)) speech = true;
}

void Linking.getInitialURL().then(handle, () => {});
Linking.addEventListener("url", (e) => handle(e.url));

export const qa = {
  /** The sample answer to "recognise" when the QA speech hook is on, else null (use the real recognizer). */
  speechSample: (): string | null => (speech ? QA_SPEECH_SAMPLE : null),
};
