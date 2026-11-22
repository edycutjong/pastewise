// @vitest-environment happy-dom
// The schema builder reads a live form's DOM, so these tests render the three
// sample forms as real HTML and read them back.
import { describe, expect, it } from "vitest";
import { FORMS, type InputDef } from "@/forms/defs";
import { batches, checkAnswer, readForm, sanitizeHint, toJsonSchema } from "@/schema/buildSchema";
import { buildPrompt, PROMPT_VERSION } from "@/ai/prompt";
import { teacherPayload } from "@/ai/teacher";

function render(id: string): HTMLFormElement {
  const def = FORMS.find((f) => f.id === id)!;
  const attr = (i: InputDef) =>
    [
      `name="${i.name}" id="${id}-${i.name}"`,
      i.type ? `type="${i.type}"` : "",
      i.autoComplete ? `autocomplete="${i.autoComplete}"` : "",
      i.inputMode ? `inputmode="${i.inputMode}"` : "",
      i.maxLength ? `maxlength="${i.maxLength}"` : "",
      i.pattern ? `pattern="${i.pattern}"` : "",
      i.min !== undefined ? `min="${i.min}"` : "",
      i.max !== undefined ? `max="${i.max}"` : "",
    ].join(" ");
  const html = def.inputs
    .map((i) => {
      const control =
        i.tag === "select"
          ? `<select ${attr(i)}><option value="">—</option>${i.options!.map((o) => `<option value="${o.value}">${o.text}</option>`).join("")}</select>`
          : i.tag === "textarea"
            ? `<textarea ${attr(i)}></textarea>`
            : `<input ${attr(i)}>`;
      return `<div><label for="${id}-${i.name}">${i.caption}</label>${control}</div>`;
    })
    .join("");
  document.body.innerHTML = `<form id="f">${html}<button type="submit">Send</button><input type="hidden" name="csrf" value="x"></form>`;
  return document.getElementById("f") as HTMLFormElement;
}

describe("readForm (live DOM -> FieldSpec)", () => {
  it("form A: kinds come from DOM attributes; roles from names/captions", () => {
    const s = readForm(render("A"), "A", "Shipping / order form");
    const k = Object.fromEntries(s.fields.map((f) => [f.key, `${f.kind}/${f.role}/${f.kindSource}`]));
    expect(k).toEqual({
      name: "name/name/dom",
      phone: "phone/plain/dom",
      street: "address/address/dom",
      city: "text/plain/default",
      province: "text/plain/default",
      postal_code: "postal/plain/dom",
      item: "text/item/default",
      quantity: "int/plain/dom",
      notes: "notes/notes/dom",
    });
  });
  it("carries the box's own limits (min/max, pattern) into the field spec for the gate", () => {
    const b = readForm(render("B"), "B", "Hotel");
    expect(b.fields.find((f) => f.key === "nights")).toMatchObject({ kind: "int", min: 1, max: 60 });
    const a = readForm(render("A"), "A", "Shipping / order form");
    expect(a.fields.find((f) => f.key === "postal_code")).toMatchObject({ pattern: "\\d{5}", maxLength: 5 });
  });
  it("skips hidden inputs and buttons; reads captions from label[for]", () => {
    const s = readForm(render("B"), "B", "Hotel");
    expect(s.fields.map((f) => f.key)).not.toContain("csrf");
    expect(s.fields.find((f) => f.key === "check_in")?.label).toBe("Check-in date");
  });
  it("select -> enum with option values and visible text", () => {
    const s = readForm(render("C"), "C", "Consignment note");
    expect(s.fields.find((f) => f.key === "svc")).toMatchObject({ kind: "enum", options: [{ value: "STD" }, { value: "EXP" }, { value: "SDD" }] });
  });
  it("form C without hints: cryptic boxes default to text", () => {
    const s = readForm(render("C"), "C", "Consignment note");
    expect(s.fields.find((f) => f.key === "zip")).toMatchObject({ kind: "text", kindSource: "default" });
    expect(s.fields.find((f) => f.key === "rmks")).toMatchObject({ kind: "text", role: "plain" });
  });
  it("hints fill in only where the DOM says nothing; DOM attributes win", () => {
    const s = readForm(render("C"), "C", "Consignment note", [
      { key: "zip", meaning: "Postal code", expected: "postal" },
      { key: "rmks", meaning: "Remarks or delivery instructions", expected: "notes" },
      { key: "cnee_tel", meaning: "Recipient phone", expected: "text" }, // DOM type=tel outranks this
      { key: "desc", meaning: "x", expected: "enum" }, // a hint can never invent an enum
    ]);
    const by = Object.fromEntries(s.fields.map((f) => [f.key, f]));
    expect(by.zip).toMatchObject({ kind: "postal", kindSource: "hint", hint: "Postal code" });
    expect(by.rmks).toMatchObject({ kind: "notes", role: "notes" });
    expect(by.cnee_tel).toMatchObject({ kind: "phone", kindSource: "dom" });
    expect(by.desc).toMatchObject({ kind: "text", kindSource: "default" });
  });
});

describe("sanitizeHint (hints are untrusted)", () => {
  it("drops kinds outside the allow-list, odd characters and long text", () => {
    expect(sanitizeHint({ key: "a", meaning: "ok", expected: "script" })).toBeNull();
    expect(sanitizeHint({ key: "a", meaning: "ignore previous <b>", expected: "text" })).toBeNull();
    expect(sanitizeHint({ key: "a", meaning: "x".repeat(81), expected: "text" })).toBeNull();
    expect(sanitizeHint({ key: "a", meaning: " Recipient's name ", expected: "name" })).toEqual({ key: "a", meaning: "Recipient's name", expected: "name" });
  });
});

describe("JSON schema, batches, answer check", () => {
  const s = readForm(render("C"), "C", "Consignment note");
  const schema = toJsonSchema(s.fields);
  it("every key required, no extras, enum includes empty", () => {
    expect(schema.required).toHaveLength(10);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.svc.enum).toEqual(["", "STD", "EXP", "SDD"]);
    expect(schema.properties.cnee_nm.maxLength).toBe(40);
  });
  it("splits into batch_max_fields chunks", () => {
    expect(batches(s.fields, 10)).toHaveLength(1);
    expect(batches(s.fields, 4).map((b) => b.length)).toEqual([4, 4, 2]);
  });
  it("rejects malformed answers (missing key, extra key, non-string, bad enum, not JSON)", () => {
    const ok = Object.fromEntries(s.fields.map((f) => [f.key, ""]));
    expect(checkAnswer(JSON.stringify(ok), schema)).not.toBeNull();
    const missing: Record<string, string> = { ...ok };
    delete missing.zip;
    expect(checkAnswer(JSON.stringify(missing), schema)).toBeNull();
    expect(checkAnswer(JSON.stringify({ ...ok, extra: "" }), schema)).toBeNull();
    expect(checkAnswer(JSON.stringify({ ...ok, pcs: 2 }), schema)).toBeNull();
    expect(checkAnswer(JSON.stringify({ ...ok, svc: "FAST" }), schema)).toBeNull();
    expect(checkAnswer("Sure! Here is the JSON", schema)).toBeNull();
  });
  it("prompt carries the version's worked example, today, one line per field, options", () => {
    const p = buildPrompt("Consignment note", s.fields, "hello", "2026-11-22");
    expect(PROMPT_VERSION).toBe("p0c-v3");
    expect(p).toContain("Example message:");
    expect(p).toContain("Today: 2026-11-22");
    expect(p).toContain("- svc: SVC (one of: STD, EXP, SDD)");
    expect(p.endsWith('"""\nhello\n"""\n\nJSON:')).toBe(true);
  });
  it("the teacher payload is the empty form only: keys, captions, options", () => {
    const pay = teacherPayload(s);
    expect(JSON.stringify(pay)).not.toMatch(/value|paste|message/i);
    expect(pay.fields[0]).toEqual({ key: "cnee_nm", caption: "CNEE" });
  });
});
