import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import push from "../../push.json";

/**
 * Remote push registration — factory-owned, imported once by index.js. Never asks for permission itself: whenever
 * the app's own code gets notification permission, this registers the device token with the factory's App Cloud
 * (on launch, on every return to the foreground, and when the OS rotates the token). No-op without push.json registerUrl.
 */
const TOKEN_KEY = "agf_push_token_v1";
const ID_KEY = "agf_install_id"; // same anonymous install id as src/modules/analytics.ts
let busy = false;

async function installId(): Promise<string> {
  let iid = await AsyncStorage.getItem(ID_KEY).catch(() => null);
  if (!iid) {
    iid = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    await AsyncStorage.setItem(ID_KEY, iid).catch(() => {});
  }
  return iid;
}

async function send(token: string): Promise<void> {
  if ((await AsyncStorage.getItem(TOKEN_KEY).catch(() => null)) === token) return; // unchanged
  const res = await fetch(push.registerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app: push.app,
      iid: await installId(),
      token,
      platform: Platform.OS,
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (res.ok) await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** Register this install's device token if notifications are allowed. Safe to call any time. */
export async function registerPush(): Promise<void> {
  if (!push.registerUrl || busy) return;
  busy = true;
  try {
    if (!(await Notifications.getPermissionsAsync())?.granted) return;
    const t = await Notifications.getDevicePushTokenAsync();
    await send(String(t.data));
  } catch {
    // offline / no Play services — retried on the next foreground
  } finally {
    busy = false;
  }
}

if (push.registerUrl) {
  void registerPush();
  AppState.addEventListener("change", (s) => s === "active" && void registerPush());
  try {
    Notifications.addPushTokenListener((t) => void send(String(t.data)).catch(() => {}));
  } catch {
    // listener unsupported on this runtime
  }
}
