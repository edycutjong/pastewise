// The code acceptance gate. Code decides; the model cannot override it.
// A value is accepted ("found in your text") only if, after the field's
// cleanup, it appears in the paste AND passes the field's format check.
// Everything else stays amber with a reason the person can read.
import type { FieldSpec } from "@/forms/types";
import { gateDate } from "./date";
import { gateEmail } from "./email";
import { gateEnum } from "./enum";
import { gateInt } from "./number";
import { gatePhone } from "./phone";
import { gatePostal } from "./postal";
import { gateText } from "./text";
import { amber, type GateResult } from "./types";

export const GATE_VERSION = "4";

/** Release response (eval plan §6, decided before any run): a critical field whose accepted-wrong rate on the bench set
 *  exceeded 5% (mean of 3 repeats, hints off) is always amber. Measured 2026-11-22 on the 180-pair bench: recipient name on
 *  form A 10.6% and on form C 8.3% (the model picks the sender, a kinship word, an organisation). The box is still pre-filled
 *  with the model's value, but it is never shown as "found in your text": the person confirms it. Keys are unique per form. */
export const ALWAYS_CHECK_KEYS: ReadonlySet<string> = new Set(["name", "cnee_nm"]);
export type { GateResult, Reason } from "./types";

export function gateField(paste: string, field: FieldSpec, proposed: string, today: string): GateResult {
  const r = withinBox(field, gateKind(paste, field, String(proposed ?? ""), today));
  if (r.state === "found" && ALWAYS_CHECK_KEYS.has(field.key)) return amber("check_by_hand", r.value, r.proposed, { spans: r.spans });
  return r;
}

/** HTML pattern semantics: the whole value must match, compiled with the "v" flag as browsers do; a pattern that does not compile
 *  is ignored, as the browser ignores it. */
function patternRe(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`, "v");
  } catch {
    return null;
  }
}

/** The live box's own limits apply after the kind check: a value the box would refuse (maxlength, min/max, pattern) is never "found". */
export function withinBox(field: FieldSpec, r: GateResult): GateResult {
  if (r.state !== "found") return r;
  const v = r.value;
  if (field.maxLength !== undefined && v.length > field.maxLength) return amber("too_long", "", r.proposed);
  if (field.kind === "int") {
    const n = Number(v);
    if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) return amber("format", "", r.proposed);
  }
  if (field.pattern) {
    const re = patternRe(field.pattern);
    if (re && !re.test(v)) return amber("format", "", r.proposed);
  }
  return r;
}

function gateKind(paste: string, field: FieldSpec, v: string, today: string): GateResult {
  switch (field.kind) {
    case "phone":
      return gatePhone(paste, v);
    case "date":
      return gateDate(paste, v, today);
    case "int":
      return gateInt(paste, v);
    case "postal":
      return gatePostal(paste, v);
    case "email":
      return gateEmail(paste, v);
    case "enum":
      return gateEnum(paste, v, field.options ?? []);
    default:
      return gateText(paste, v, field.role);
  }
}

export function gateForm(paste: string, fields: FieldSpec[], values: Record<string, string>, today: string): Record<string, GateResult> {
  return Object.fromEntries(fields.map((f) => [f.key, gateField(paste, f, values[f.key] ?? "", today)]));
}

export const REASON_TEXT: Record<string, string> = {
  not_in_text: "not in your text",
  format: "wrong format for this box",
  too_long: "longer than this box allows",
  two_candidates: "two numbers in your text — pick one",
  year_assumed: "year assumed",
  more_than_one_name: "more than one name",
  too_few_words: "too short to be a note",
  check_by_hand: "names are always yours to confirm",
  timed_out: "timed out — try again",
  invalid_answer: "no usable answer — try again",
  invalid: "no usable answer — try again",
  error: "the on-device model failed — try again",
  not_sent: "stopped — the run was replaced or the cloud was switched off (the receipt shows what left)",
};
