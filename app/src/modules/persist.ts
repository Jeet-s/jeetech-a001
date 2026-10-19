import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * On-device persistence for app data. Each store is one versioned JSON value:
 * loaded once at boot, read synchronously afterwards, written through on every
 * change. Bump `version` and handle the old shape in `migrate` whenever the
 * data model changes — users' data must survive every update.
 */
export interface Persisted<T> {
  load(): Promise<T>;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(l: (v: T) => void): () => void;
  /** Wipe back to the initial value (Settings → "Delete all data"). */
  reset(): void;
}

export function persisted<T>(
  key: string,
  initial: T,
  opts: { version?: number; migrate?: (old: unknown, fromVersion: number) => T } = {},
): Persisted<T> {
  const version = opts.version ?? 1;
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  const write = () =>
    AsyncStorage.setItem(key, JSON.stringify({ v: version, data: value })).catch(() => {});
  return {
    async load() {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
          const from = parsed.v ?? 1;
          value =
            from === version
              ? ({ ...(initial as object), ...(parsed.data as object) } as T)
              : opts.migrate
                ? opts.migrate(parsed.data, from)
                : initial;
        }
      } catch {
        // first launch / corrupted → initial value
      }
      return value;
    },
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      listeners.forEach((l) => l(value));
      write();
    },
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    reset() {
      value = initial;
      listeners.forEach((l) => l(value));
      write();
    },
  };
}

/** Re-render on every change of a persisted store. */
export function usePersisted<T>(p: Persisted<T>): T {
  const [v, setV] = useState(p.get());
  useEffect(() => p.subscribe(setV), [p]);
  return v;
}
