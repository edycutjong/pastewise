"use client";
// Remote Config readers with compiled-in defaults: a failed fetch never breaks the page.
import { getValue } from "firebase/remote-config";
import { firebase, RC_DEFAULTS } from "./firebase";

export function rcNumber(key: "paste_char_cap" | "fill_timeout_ms" | "batch_max_fields"): number {
  try {
    const v = getValue(firebase().rc, key).asNumber();
    return v > 0 ? v : RC_DEFAULTS[key];
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
