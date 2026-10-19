import config from "../../cloud.json";
import { cloud, CloudFailure } from "./cloud";
import { analytics } from "./analytics";

/**
 * AI features through the factory's AI proxy (only when the factory enabled AI
 * for this app). The prompts live on the server (registered from ai.json); the
 * app sends just the feature id and the user's input.
 *
 * ALWAYS handle every failure reason in the UI:
 *   "quota"    → free uses for today are used up: show the Pro / subscription sheet
 *   "offline"  → keep the user's input, offer Retry
 *   "disabled" | "error" | "busy" → friendly message; the core app must keep working
 */
export type AiResult =
  | { ok: true; text: string; json?: unknown; remaining: number }
  | { ok: false; reason: "quota" | "offline" | "disabled" | "busy" | "error"; message: string };

export const ai = {
  enabled: !!config.ai && cloud.online,

  async run(feature: string, input: string): Promise<AiResult> {
    if (!ai.enabled) return { ok: false, reason: "disabled", message: "AI isn't available in this version." };
    try {
      const r = await cloud.api<{ text: string; json?: unknown; remaining: number }>("/ai", { body: { feature, input } });
      analytics.track("ai_used", { feature });
      return { ok: true, ...r };
    } catch (e) {
      const code = e instanceof CloudFailure ? e.code : "error";
      const reason = code === "quota" ? "quota" : code === "offline" ? "offline" : code === "busy" ? "busy" : code === "disabled" ? "disabled" : "error";
      if (reason === "quota") analytics.track("ai_quota_hit", { feature });
      return { ok: false, reason, message: e instanceof Error ? e.message : "AI is unavailable right now." };
    }
  },
};
