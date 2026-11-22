"use client";
// Remote Config readers with compiled-in defaults: a failed fetch never breaks the page.
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { firebase, RC_DEFAULTS } from "./firebase";
import { withTimeout } from "./timeout";

// A bad remote value must not weaken a guard (cap 5,000,000) or break fills (timeout 1 ms): clamp, else use the default.
const LIMITS = { paste_char_cap: [200, 20000], fill_timeout_ms: [2000, 60000], batch_max_fields: [1, 20] } as const;

export function rcNumber(key: "paste_char_cap" | "fill_timeout_ms" | "batch_max_fields"): number {
  try {
    const v = getValue(firebase().rc, key).asNumber();
    const [lo, hi] = LIMITS[key];
    return v >= lo && v <= hi ? v : RC_DEFAULTS[key];
  } catch {
    return RC_DEFAULTS[key];
  }
}

export function rcString(key: "teacher_model" | "gate_rules_version"): string {
  try {
    return getValue(firebase().rc, key).asString() || RC_DEFAULTS[key];
  } catch {
    return RC_DEFAULTS[key];
  }
}

/** The emergency switch: true turns the cloud off everywhere (teacher falls back to the saved copy; no consent path). */
export function cloudKillSwitch(): boolean {
  try {
    return getValue(firebase().rc, "cloud_kill_switch").asBoolean();
  } catch {
    return RC_DEFAULTS.cloud_kill_switch;
  }
}

let killFetch: Promise<boolean> | null = null;

/** Re-fetches Remote Config (2.5 s timeout, no 60 s throttle for this one fetch) so a switch flipped after page load is honoured.
 *  Single-flight: callers that overlap (the consent sheet opening, then its Yes; the Teach button) share one fetch, so the throttle
 *  setting is saved and restored exactly once and can never be left at 0. A failed or slow fetch keeps the last activated value. */
export function refreshCloudKill(): Promise<boolean> {
  if (killFetch) return killFetch;
  const run = async () => {
    try {
      const { rc } = firebase();
      const prev = rc.settings.minimumFetchIntervalMillis;
      rc.settings.minimumFetchIntervalMillis = 0;
      try {
        await withTimeout(fetchAndActivate(rc), 2500, "rc timeout");
      } finally {
        rc.settings.minimumFetchIntervalMillis = prev;
      }
    } catch {
      /* keep the last activated value */
    }
    return cloudKillSwitch();
  };
  killFetch = run().finally(() => {
    killFetch = null;
  });
  return killFetch;
}

/** Every Remote Config value the page uses, with where it came from (remote | default | static). For the bench scripts and /receipt-style checks. */
export function rcSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(RC_DEFAULTS)) {
    try {
      const v = getValue(firebase().rc, k);
      out[k] = `${v.asString()} (${v.getSource()})`;
    } catch {
      out[k] = `${String((RC_DEFAULTS as Record<string, unknown>)[k])} (default)`;
    }
  }
  return out;
}
