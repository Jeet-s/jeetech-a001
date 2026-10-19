import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { store } from "../modules/store";

/**
 * Haptics + subtle UI sounds. Every meaningful interaction should call
 * feedback(): taps → "tap", saving/completing → "success", toggles → "pop",
 * Pro unlocks → "unlock", sheets → "whoosh", validation errors → "error".
 * Sounds default OFF for utility apps (Settings → Sounds); haptics default on.
 */
const SOURCES = {
  tap: require("../../assets/sfx/tap.wav"),
  pop: require("../../assets/sfx/pop.wav"),
  whoosh: require("../../assets/sfx/whoosh.wav"),
  success: require("../../assets/sfx/success.wav"),
  unlock: require("../../assets/sfx/unlock.wav"),
  error: require("../../assets/sfx/error.wav"),
} as const;
export type Sfx = keyof typeof SOURCES;

const players = new Map<Sfx, AudioPlayer>();

export async function initAudio(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" });
    for (const k of Object.keys(SOURCES) as Sfx[]) players.set(k, createAudioPlayer(SOURCES[k]));
  } catch {
    // audio is non-critical
  }
}

export function play(name: Sfx, volume = 0.6): void {
  if (store.get().sound !== true) return;
  const p = players.get(name);
  if (!p) return;
  try {
    p.volume = volume;
    p.seekTo(0);
    p.play();
  } catch {
    // ignore
  }
}

type Haptic = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "select";
export function haptic(kind: Haptic = "light"): void {
  if (store.get().haptics === false) return;
  const H = Haptics;
  const run =
    kind === "success" ? H.notificationAsync(H.NotificationFeedbackType.Success)
    : kind === "warning" ? H.notificationAsync(H.NotificationFeedbackType.Warning)
    : kind === "error" ? H.notificationAsync(H.NotificationFeedbackType.Error)
    : kind === "select" ? H.selectionAsync()
    : H.impactAsync(kind === "heavy" ? H.ImpactFeedbackStyle.Heavy : kind === "medium" ? H.ImpactFeedbackStyle.Medium : H.ImpactFeedbackStyle.Light);
  run.catch(() => {});
}

/** Sound + haptic together — the default for any user action. */
export function feedback(sound: Sfx, h: Haptic = "light"): void {
  play(sound);
  haptic(h);
}
