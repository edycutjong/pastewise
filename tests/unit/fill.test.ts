// fillBatch with a mocked device model: timeout, retry on a FRESH instance,
// malformed answers never partially accepted, thrown errors reported as errors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldSpec } from "@/forms/types";

type Answer = { text?: string; delayMs?: number; throws?: string };
const script: Answer[] = [];
const instances: number[] = [];

vi.mock("@/ai/models", () => ({
  deviceModel: () => {
    const id = instances.length + 1;
    instances.push(id);
    const a = script.shift() ?? { text: "{}" };
    return {
      generateContent: () =>
        new Promise((resolve, reject) =>
          setTimeout(() => {
            if (a.throws) reject(new Error(a.throws));
            else resolve({ response: { text: () => a.text ?? "", inferenceSource: "on_device" } });
          }, a.delayMs ?? 0),
        ),
    };
  },
}));

const { fillBatch, fillForm } = await import("@/ai/fill");

const fields: FieldSpec[] = [
  { key: "name", label: "Name", kind: "name", role: "name", kindSource: "dom" },
  { key: "pcs", label: "Pcs", kind: "int", role: "plain", kindSource: "dom" },
];
const ok = JSON.stringify({ name: "Ali", pcs: "3" });

beforeEach(() => {
  script.length = 0;
  instances.length = 0;
});

describe("fillBatch", () => {
  it("first answer valid -> ok after 1 attempt, inferenceSource kept", async () => {
    script.push({ text: ok });
    const r = await fillBatch(fields, "T", "Ali 3", "2026-11-22", 200);
    expect(r).toMatchObject({ status: "ok", attempts: 1, values: { name: "Ali", pcs: "3" }, inferenceSource: "on_device" });
  });
  it("timeout -> one retry on a fresh model instance -> ok", async () => {
    script.push({ text: ok, delayMs: 300 }, { text: ok });
    const why: string[] = [];
    const r = await fillBatch(fields, "T", "p", "2026-11-22", 50, (w) => why.push(w));
    expect(r).toMatchObject({ status: "ok", attempts: 2, retryReason: "timeout" });
    expect(instances).toEqual([1, 2]);
    expect(why).toEqual(["timeout"]);
  });
  it("two timeouts -> timed_out, no values", async () => {
    script.push({ text: ok, delayMs: 300 }, { text: ok, delayMs: 300 });
    const r = await fillBatch(fields, "T", "p", "2026-11-22", 30);
    expect(r).toMatchObject({ status: "timed_out", attempts: 2, values: {} });
  });
  it("malformed JSON twice -> invalid, never a partial accept", async () => {
    script.push({ text: '{"name":"Ali"}' }, { text: "Sure! name: Ali" });
    const r = await fillBatch(fields, "T", "p", "2026-11-22", 200);
    expect(r).toMatchObject({ status: "invalid", values: {} });
  });
  it("a thrown error is reported as error, not as a timeout", async () => {
    script.push({ throws: "NotSupportedError" }, { throws: "NotSupportedError" });
    const r = await fillBatch(fields, "T", "p", "2026-11-22", 200);
    expect(r.status).toBe("error");
    expect(r.error).toContain("NotSupportedError");
  });
  it("the longer cold budget applies to the first attempt only", async () => {
    script.push({ text: ok, delayMs: 80 });
    expect((await fillBatch(fields, "T", "p", "2026-11-22", 40, undefined, 200)).attempts).toBe(1);
    script.push({ text: ok, delayMs: 80 }, { text: ok, delayMs: 80 });
    expect((await fillBatch(fields, "T", "p", "2026-11-22", 40, undefined, 40)).status).toBe("timed_out");
  });
});

describe("fillForm", () => {
  it("one call per batch of batch_max_fields", async () => {
    script.push({ text: JSON.stringify({ name: "Ali" }) }, { text: JSON.stringify({ pcs: "3" }) });
    const r = await fillForm({ id: "X", title: "T", fields }, "Ali 3", { today: "2026-11-22", timeoutMs: 200, batchMax: 1 });
    expect(r.map((b) => [b.keys, b.status])).toEqual([[["name"], "ok"], [["pcs"], "ok"]]);
  });
});
