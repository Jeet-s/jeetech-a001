import AsyncStorage from "@react-native-async-storage/async-storage";
import config from "../../cloud.json";
import type { Persisted } from "./persist";

/**
 * Optional login + cloud saving through the factory's App Cloud (only when
 * cloud.json is filled — otherwise every call is a harmless no-op and the app
 * stays fully offline).
 *
 * - Accounts are ANONYMOUS first: the first cloud call creates one silently.
 * - signIn(email) → a 6-digit code by email → verifyCode() attaches the email
 *   to the anonymous account (same user, data kept) — or, if that email already
 *   has an account (e.g. a second phone), switches to it and merges.
 * - syncStore(store, collection) keeps a persisted() store backed up/synced:
 *   last write wins per store, local first, network failures never block the UI.
 * - deleteAccount() removes everything on the server (Play requirement).
 */
type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string | null; is_anonymous?: boolean } };
export interface CloudUser {
  id: string;
  email: string | null;
  anonymous: boolean;
}

const KEY = "cloud_session_v1";
const enabled = !!(config.apiUrl && config.authUrl && config.anonKey);
let session: Session | null = null;
let loaded = false;
const listeners = new Set<(u: CloudUser | null) => void>();

const toUser = (s: Session | null): CloudUser | null =>
  s ? { id: s.user.id, email: s.user.email ?? null, anonymous: !!s.user.is_anonymous && !s.user.email } : null;
const emit = () => listeners.forEach((l) => l(toUser(session)));

async function save(s: Session | null) {
  session = s;
  if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
  else await AsyncStorage.removeItem(KEY).catch(() => {});
  emit();
}

async function auth(path: string, body: unknown, token?: string, method = "POST"): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.authUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", apikey: config.anonKey, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new CloudFailure(res.status === 429 ? "rate_limited" : "auth_failed", String(json.msg ?? json.error_description ?? json.message ?? "Sign-in failed"));
  return json;
}

const asSession = (j: Record<string, unknown>): Session => ({
  access_token: String(j.access_token),
  refresh_token: String(j.refresh_token),
  expires_at: Date.now() + Number(j.expires_in ?? 3600) * 1000,
  user: j.user as Session["user"],
});

export class CloudFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) session = JSON.parse(raw);
  } catch {
    session = null;
  }
}

/** A valid access token, creating an anonymous account or refreshing as needed. */
async function token(): Promise<string> {
  if (!enabled) throw new CloudFailure("disabled", "Cloud is off");
  await load();
  if (session && session.expires_at - 60_000 > Date.now()) return session.access_token;
  if (session) {
    try {
      await save(asSession(await auth("/token?grant_type=refresh_token", { refresh_token: session.refresh_token })));
      return session!.access_token;
    } catch (e) {
      if (e instanceof CloudFailure && e.code === "rate_limited") throw e;
      // refresh token revoked/expired: start over below (anonymous) — signed-in users sign in again
    }
  }
  await save(asSession(await auth("/signup", { data: {} })));
  return session!.access_token;
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${config.apiUrl}/api/cloud${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", authorization: `Bearer ${await token()}`, "x-app-package": config.app },
    body: init.body ? JSON.stringify(init.body) : undefined,
  }).catch(() => null);
  if (!res) throw new CloudFailure("offline", "You're offline");
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new CloudFailure(json.error ?? "error", json.message ?? "Something went wrong");
  return json;
}

let pendingEmail = "";

export const cloud = {
  /** True when this build has cloud saving switched on (cloud.json). */
  enabled: enabled && config.cloud.enabled,
  /** Any online capability (cloud or AI) — the account section belongs in Settings. */
  online: enabled,
  emailSignIn: enabled && config.cloud.email,
  proOnly: config.cloud.proOnly,
  deleteAccountUrl: config.deleteAccountUrl,
  api,

  async user(): Promise<CloudUser | null> {
    await load();
    return toUser(session);
  },
  subscribe(l: (u: CloudUser | null) => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Step 1: email a 6-digit code. Attaches to the current anonymous account when there is one. */
  async signIn(email: string): Promise<void> {
    pendingEmail = email.trim().toLowerCase();
    await load();
    if (session?.user.is_anonymous) {
      try {
        await auth("/user", { email: pendingEmail }, await token(), "PUT");
        return;
      } catch (e) {
        // Email already belongs to an account → fall through to a normal sign-in code.
        if (!(e instanceof CloudFailure) || e.code === "rate_limited") throw e;
      }
    }
    await auth("/otp", { email: pendingEmail, create_user: true });
  },

  /** Step 2: confirm the code. Returns true if this switched to an EXISTING account (merge data). */
  async verifyCode(code: string): Promise<{ switched: boolean }> {
    const before = session?.user.id;
    const token6 = code.replace(/\D/g, "");
    let j: Record<string, unknown>;
    try {
      j = await auth("/verify", { type: "email_change", email: pendingEmail, token: token6 });
    } catch {
      j = await auth("/verify", { type: "email", email: pendingEmail, token: token6 });
    }
    await save(asSession(j));
    return { switched: !!before && before !== session!.user.id };
  },

  async signOut(): Promise<void> {
    if (session) await auth("/logout", {}, session.access_token).catch(() => {});
    await save(null);
  },

  /** Delete the account and all its cloud data for this app, then sign out locally. */
  async deleteAccount(): Promise<void> {
    await api("/account", { method: "DELETE" });
    await save(null);
  },

  /** Server-verified Pro status (subscriptions + lifetime). */
  async status(): Promise<{ pro: boolean; email: string | null; anonymous: boolean }> {
    return api("/account");
  },

  /** Send a Play purchase token for server verification (Pro + AI quota follow it). */
  async verifyPurchase(p: { token: string; sku: string; kind: "subscription" | "one_time" }): Promise<{ valid: boolean; pro: boolean } | null> {
    if (!enabled) return null;
    return api("/purchases", { body: p }).catch(() => null) as Promise<{ valid: boolean; pro: boolean } | null>;
  },
};

/**
 * Back a persisted() store with the cloud: pull on start / sign-in (newer
 * remote copy wins), push every local change (debounced). Returns a function
 * that pulls now (call it after signing in or after switching account).
 */
export function syncStore<T>(store: Persisted<T>, collection: string): { pullNow: (opts?: { merge?: (local: T, remote: T) => T }) => Promise<void> } {
  const META = `cloud_sync_${collection}`;
  let localAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let applying = false;
  const off = { pullNow: async () => {} };
  if (!cloud.enabled) return off;

  AsyncStorage.getItem(META).then((v) => (localAt = Number(v) || 0)).catch(() => {});
  const push = async () => {
    timer = null;
    try {
      await api("/data", { body: { records: [{ collection, key: "main", data: store.get(), updated_at: new Date(localAt).toISOString() }] } });
    } catch {
      // offline / quota — the next change retries; local data is never at risk
    }
  };
  store.subscribe(() => {
    if (applying) return;
    localAt = Date.now();
    AsyncStorage.setItem(META, String(localAt)).catch(() => {});
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, 2500);
  });
  const pullNow = async (opts: { merge?: (local: T, remote: T) => T } = {}) => {
    try {
      const r = await api<{ records: { key: string; data: T; deleted: boolean; updated_at: string }[] }>(`/data?collection=${encodeURIComponent(collection)}`);
      const remote = r.records.find((x) => x.key === "main" && !x.deleted);
      if (!remote) return void (localAt && push());
      const remoteAt = Date.parse(remote.updated_at);
      if (opts.merge) {
        applying = true;
        store.set(opts.merge(store.get(), remote.data));
        applying = false;
        localAt = Date.now();
        await push();
      } else if (remoteAt > localAt) {
        applying = true;
        store.set(remote.data);
        applying = false;
        localAt = remoteAt;
        await AsyncStorage.setItem(META, String(localAt)).catch(() => {});
      } else if (localAt > remoteAt) await push();
    } catch {
      // offline — try again next launch
    }
  };
  void pullNow();
  return { pullNow };
}
