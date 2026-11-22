// Run-state rules: a late batch from an old run is dropped, a box the person
// edited is never overwritten, edited boxes never count as "found", and a
// result from a previous message is marked stale.
import { describe, expect, it } from "vitest";
import { boxClass, countBoxes, mergeBatch, rowForCopy, stateNote, type FormRun } from "@/components/runState";
import type { FieldSpec } from "@/forms/types";
import type { BatchResult } from "@/ai/fill";

const fields: FieldSpec[] = [
  { key: "guest", label: "Guest", kind: "name", role: "name", kindSource: "dom" },
  { key: "phone", label: "Phone", kind: "phone", role: "plain", kindSource: "dom" },
];
const paste = "Send to Sari Dewi, 0812 5550 9001";
const batch = (values: Record<string, string>, status: BatchResult["status"] = "ok"): BatchResult => ({
  keys: ["guest", "phone"],
  status,
  values,
  ms: 1,
  attempts: 1,
  inferenceSource: "on_device",
});
const run = (over: Partial<FormRun> = {}): FormRun => ({ runId: "r1", paste, boxes: {}, batches: [], ms: 0, done: false, ...over });

describe("mergeBatch", () => {
  it("gates every value against the run's own paste", () => {
    const r = mergeBatch(run(), "r1", fields, batch({ guest: "Sari Dewi", phone: "0812 5550 9001" }), "2026-11-22")!;
    expect(r.boxes.guest.gate?.state).toBe("found");
    expect(r.boxes.phone.value).toBe("081255509001");
  });
  it("a batch for another run id is dropped (late result)", () => {
    const before = run({ runId: "r2" });
    expect(mergeBatch(before, "r1", fields, batch({ guest: "Sari Dewi", phone: "" }), "2026-11-22")).toBe(before);
  });
  it("never overwrites a box the person edited while it was reading", () => {
    const r = mergeBatch(run({ boxes: { guest: { value: "Sari D.", edited: true } } }), "r1", fields, batch({ guest: "Sari Dewi", phone: "" }), "2026-11-22")!;
    expect(r.boxes.guest).toEqual({ value: "Sari D.", edited: true });
  });
  it("a failed batch never overwrites an edited box either", () => {
    const r = mergeBatch(run({ boxes: { phone: { value: "0812", edited: true } } }), "r1", fields, batch({}, "timed_out"), "2026-11-22")!;
    expect(r.boxes.phone).toEqual({ value: "0812", edited: true });
    expect(r.boxes.guest).toEqual({ value: "", failed: "timed_out" });
  });
  it("a failed batch turns its boxes amber with the failure, no values", () => {
    const r = mergeBatch(run(), "r1", fields, batch({}, "error"), "2026-11-22")!;
    expect(r.boxes.guest).toEqual({ value: "", failed: "error" });
    expect(stateNote(r.boxes.guest, false)).toBe("the on-device model failed — try again");
  });
});

describe("countBoxes / boxClass / stateNote", () => {
  const filled = mergeBatch(run(), "r1", fields, batch({ guest: "Sari Dewi", phone: "0899 0000 0000" }), "2026-11-22")!;
  it("found and to-check are counted from the gate", () => {
    expect(countBoxes(filled, ["guest", "phone"])).toMatchObject({ found: 1, amber: 1, edited: 0 });
  });
  it("an edited box counts as edited, never as found in your text", () => {
    const edited = { ...filled, boxes: { ...filled.boxes, guest: { ...filled.boxes.guest, value: "Someone Else", edited: true } } };
    expect(countBoxes(edited, ["guest", "phone"])).toMatchObject({ found: 0, amber: 1, edited: 1 });
    expect(boxClass(edited.boxes.guest, false)).toBe("edited");
    expect(stateNote(edited.boxes.guest, false)).toBe("edited by you");
  });
  it("after the message changes, found AND amber boxes are marked stale", () => {
    expect(boxClass(filled.boxes.guest, true)).toBe("found stale");
    expect(boxClass(filled.boxes.phone, true)).toBe("amber stale");
    expect(stateNote(filled.boxes.phone, true)).toBe("from the previous message, fill again");
  });
  it("an amber note names the reason and what the model suggested, never 'verified'", () => {
    expect(stateNote(filled.boxes.phone, false)).toMatch(/^not in your text — the model suggested/);
  });
});

describe("rowForCopy (copy for a spreadsheet)", () => {
  const cols = [
    { name: "name", caption: "Recipient name" },
    { name: "phone", caption: "Phone" },
    { name: "notes", caption: "Delivery notes" },
    { name: "city", caption: "City" },
  ];
  const run = {
    runId: "r1",
    paste: "",
    batches: [],
    ms: 0,
    done: true,
    boxes: {
      name: { value: "Maya Kusuma", gate: { state: "amber" } },
      phone: { value: "", gate: { state: "amber" } },
      notes: { value: "leave at the\nguard post\tplease", gate: { state: "found" } },
      city: { value: "Jakarta Pusat", gate: { state: "found" }, edited: true },
    },
  } as unknown as FormRun;

  it("puts captions on the first row and the box values, tab-separated, on the second", () => {
    const r = rowForCopy(run, cols);
    expect(r.tsv).toBe("Recipient name\tPhone\tDelivery notes\tCity\nMaya Kusuma\t\tleave at the guard post please\tJakarta Pusat");
  });

  it("names the amber boxes the person has not touched, by caption, and counts the values", () => {
    const r = rowForCopy(run, cols);
    expect(r.amber).toEqual(["Recipient name", "Phone"]);
    expect(r.filled).toBe(3);
  });

  it("no run: empty values, nothing to check", () => {
    const r = rowForCopy(undefined, cols);
    expect(r.tsv.split("\n")[1]).toBe("\t\t\t");
    expect(r.amber).toEqual([]);
    expect(r.filled).toBe(0);
  });
});
