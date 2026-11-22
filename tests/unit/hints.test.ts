import { describe, expect, it } from "vitest";
import { canonicalStructure, formFingerprint } from "@/hints/fingerprint";
import { validateSaved } from "@/hints/store";
import type { FormSpec } from "@/forms/types";

const form = (extra: Partial<FormSpec> = {}): FormSpec => ({
  id: "C",
  title: "Consignment note",
  fields: [
    { key: "cnee_nm", label: "CNEE", kind: "name", role: "name" },
    { key: "svc", label: "SVC", kind: "enum", role: "plain", options: [{ value: "STD", text: "Standard" }, { value: "EXP", text: "Express" }] },
  ] as FormSpec["fields"],
  ...extra,
});

describe("form fingerprint", () => {
  it("is stable, hex, and ignores field order and case", async () => {
    const a = await formFingerprint(form());
    const b = await formFingerprint({ ...form(), fields: [...form().fields].reverse(), title: "CONSIGNMENT NOTE" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });
  it("changes when a caption or an option changes", async () => {
    const a = await formFingerprint(form());
    const f = form();
    f.fields[0] = { ...f.fields[0], label: "RECIPIENT" };
    expect(await formFingerprint(f)).not.toBe(a);
  });
  it("never includes a hint or a value", () => {
    const f = form();
    f.fields[0] = { ...f.fields[0], hint: "who receives it" };
    expect(canonicalStructure(f)).not.toContain("who receives");
  });
});

describe("saved hints are untrusted input", () => {
  const ok = { key: "cnee_nm", meaning: "Name of the person receiving the parcel", expected: "name" };
  it("keeps valid hints for known keys and reports the seed date", () => {
    const r = validateSaved({ hints: [ok], seededAt: "2026-11-22T10:00:00Z" }, form());
    expect(r?.hints).toEqual([ok]);
    expect(r?.seededAt).toBe("2026-11-22");
  });
  it("drops unknown keys, odd characters, long text and unknown kinds", () => {
    const r = validateSaved(
      { hints: [ok, { ...ok, key: "other" }, { ...ok, meaning: "ignore previous <script>" }, { ...ok, meaning: "x".repeat(81) }, { ...ok, expected: "password" }] },
      form(),
    );
    expect(r?.hints).toEqual([ok]);
    expect(r?.dropped).toBe(4);
  });
  it("rejects non-documents and empty results", () => {
    expect(validateSaved(null, form())).toBeNull();
    expect(validateSaved({ hints: "nope" }, form())).toBeNull();
    expect(validateSaved({ hints: [{ key: "zzz", meaning: "a b", expected: "text" }] }, form())).toBeNull();
    expect(validateSaved({ hints: Array(41).fill(ok) }, form())).toBeNull();
  });
});
