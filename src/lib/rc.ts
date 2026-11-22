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
