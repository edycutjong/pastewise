// Form schema builder: live form DOM -> FieldSpec[] -> JSON schema per batch.
// Reads only the EMPTY form's structure (names, captions, types, options); it
// never reads values, so the same structure is safe to show to the teacher.
import { KINDS, type FieldSpec, type FormSpec, type Kind, type Role } from "@/forms/types";

export type Hint = { key: string; meaning: string; expected: string };
export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: "string"; enum?: string[]; maxLength?: number }>;
  required: string[];
  additionalProperties: false;
};

type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function captionFor(el: El, root: ParentNode): string {
  const byFor = el.id ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrapping = el.closest("label");
  const text = (byFor ?? wrapping)?.textContent ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.name;
  return text.replace(/\s+/g, " ").trim();
}

/** Kind from DOM attributes only; null when the markup says nothing decisive. */
export function kindFromDom(el: El): Kind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === "select") return "enum";
  if (tag === "textarea") return "notes";
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  const im = (el.getAttribute("inputmode") ?? "").toLowerCase();
  if (type === "tel" || ac.startsWith("tel") || im === "tel") return "phone";
  if (type === "email" || ac === "email" || im === "email") return "email";
  if (type === "date") return "date";
  if (type === "number") return "int";
  if (ac === "postal-code") return "postal";
  if (ac === "name" || ac === "given-name" || ac === "family-name") return "name";
  if (ac === "address-line1" || ac === "street-address") return "address";
  return null;
}

const ITEM = /(^|[_\s-])(item|items|desc|description|product|goods|barang)($|[_\s-])/i;
const NAME = /(^|[_\s-])(name|nm|recipient|guest|nama)($|[_\s-])/i;
const ADDR = /(^|[_\s-])(street|addr|address|alamat)($|[_\s-])/i;
const NOTES = /(^|[_\s-])(notes?|remarks?|requests?|instructions?|comments?)($|[_\s-])/i;

export function roleFor(kind: Kind, key: string, label: string): Role {
  if (kind === "name") return "name";
  if (kind === "address") return "address";
  if (kind === "notes") return "notes";
  if (kind !== "text") return "plain";
  const words = `${key} ${label}`;
  if (ITEM.test(words)) return "item";
  if (NAME.test(words)) return "name";
  if (ADDR.test(words)) return "address";
  if (NOTES.test(words)) return "notes";
  return "plain";
}

/** Hints from the teacher or Firestore are untrusted: allow-list + charset + length, else dropped. */
export function sanitizeHint(h: Partial<Hint> | null | undefined): Hint | null {
  if (!h || typeof h.key !== "string" || typeof h.meaning !== "string" || typeof h.expected !== "string") return null;
  if (!(KINDS as readonly string[]).includes(h.expected)) return null;
  const meaning = h.meaning.replace(/\s+/g, " ").trim();
  if (!meaning || meaning.length > 80 || !/^[A-Za-z0-9 ,./()&'-]+$/.test(meaning)) return null;
  return { key: h.key, meaning, expected: h.expected };
}

/** Builds a FieldSpec from one control plus an optional hint. DOM attributes outrank the hint. */
export function fieldFromControl(el: El, root: ParentNode, hint?: Hint | null): FieldSpec {
  const label = captionFor(el, root);
  const dom = kindFromDom(el);
  const hinted = !dom && hint ? (hint.expected as Kind) : null;
  // A hint can never turn a non-select into an enum (no options to check against).
  const kind: Kind = dom ?? (hinted && hinted !== "enum" ? hinted : "text");
  const kindSource = dom ? "dom" : hinted && hinted !== "enum" ? "hint" : "default";
  const spec: FieldSpec = { key: el.name, label, kind, role: roleFor(kind, el.name, label), kindSource };
  if (el instanceof HTMLSelectElement || el.tagName.toLowerCase() === "select") {
    spec.options = Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value !== "")
      .map((o) => ({ value: o.value, text: (o.textContent ?? o.value).trim() }));
  }
  const ml = Number(el.getAttribute("maxlength"));
  if (ml > 0) spec.maxLength = ml;
  for (const a of ["min", "max"] as const) {
    const raw = el.getAttribute(a);
    if (raw !== null && raw.trim() !== "" && Number.isFinite(Number(raw))) spec[a] = Number(raw);
  }
  const pat = el.getAttribute("pattern");
  if (pat) spec.pattern = pat;
  const ph = el.getAttribute("placeholder");
  if (ph) spec.placeholder = ph;
  if (hint) spec.hint = hint.meaning;
  return spec;
}

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Reads every named control of a live form, in DOM order. */
export function readForm(form: HTMLFormElement, id: string, title: string, hints: Hint[] = []): FormSpec {
  const byKey = new Map<string, Hint>();
  for (const h of hints) {
    const s = sanitizeHint(h);
    if (s) byKey.set(s.key, s);
  }
  const controls = Array.from(form.querySelectorAll<El>("input[name], select[name], textarea[name]")).filter(
    (el) => !["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "password"].includes(
      (el.getAttribute("type") ?? "").toLowerCase(),
    ),
  );
  // a key must be usable as a plain JSON-schema / object key: no empty names, no prototype names, and one field per name
  // (a second control with the same name is skipped, so two boxes never collapse into one schema key)
  const seen = new Set<string>();
  const usable = controls.filter((el) => {
    const k = el.name;
    if (!k.trim() || RESERVED_KEYS.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { id, title, fields: usable.map((el) => fieldFromControl(el, form, byKey.get(el.name))) };
}

export function toJsonSchema(fields: FieldSpec[]): JsonSchema {
  const properties: JsonSchema["properties"] = {};
  for (const f of fields) {
    if (f.kind === "enum" && f.options?.length) properties[f.key] = { type: "string", enum: ["", ...f.options.map((o) => o.value)] };
    else {
      const free = f.kind === "text" || f.kind === "address" || f.kind === "notes" || f.kind === "name";
      properties[f.key] = { type: "string", maxLength: Math.min(f.maxLength ?? (free ? 120 : 40), 200) };
    }
  }
  return { type: "object", properties, required: fields.map((f) => f.key), additionalProperties: false };
}

/** One model call per batch; batch_max_fields comes from Remote Config (default 10). */
export function batches(fields: FieldSpec[], max: number): FieldSpec[][] {
  const n = Math.max(1, Math.floor(max) || 10);
  const out: FieldSpec[][] = [];
  for (let i = 0; i < fields.length; i += n) out.push(fields.slice(i, i + n));
  return out;
}

/** The model's JSON must match the batch schema exactly; anything else is the timeout/retry path. */
export function checkAnswer(text: string, schema: JsonSchema): Record<string, string> | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const rec = obj as Record<string, unknown>;
  const want = Object.keys(schema.properties).sort().join("\u0000");
  if (Object.keys(rec).sort().join("\u0000") !== want) return null;
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = rec[k];
    if (typeof v !== "string") return null;
    if (p.enum && !p.enum.includes(v)) return null;
  }
  return rec as Record<string, string>;
}
