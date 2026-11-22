// Unplug must fail: remove the AI Logic SDK's model and the fill path must fail LOUDLY, with no value invented by any other code.
// Pastewise has no regex/heuristic fallback; this test is the proof, and its plugged-in control shows the test can pass the other way.
import { describe, expect, it, vi } from "vitest";
import type { FieldSpec, FormSpec } from "@/forms/types";

const plugged = { on: false };

vi.mock("@/lib/firebase", () => ({ firebase: () => ({ ai: {} }) }));
vi.mock("@/lib/rc", () => ({ cloudKillSwitch: () => false }));
vi.mock("firebase/ai", () => ({
  InferenceMode: { ONLY_ON_DEVICE: "only_on_device", ONLY_IN_CLOUD: "only_in_cloud", PREFER_ON_DEVICE: "prefer_on_device" },
  Schema: { object: (x: unknown) => x, string: (x: unknown) => x, enumString: (x: unknown) => x, array: (x: unknown) => x },
  getGenerativeModel: () => {
    if (!plugged.on) throw new Error("AI Logic unplugged: getGenerativeModel is not available");
    return {
      generateContent: async () => ({
        response: { text: () => JSON.stringify({ name: "Tia Ramadhani", phone: "081300001111" }), inferenceSource: "on_device" },
      }),
    };
  },
}));

const { fillForm } = await import("@/ai/fill");

const fields: FieldSpec[] = [
  { key: "name", label: "Recipient name", kind: "name", role: "name", kindSource: "dom" },
  { key: "phone", label: "Phone", kind: "phone", role: "plain", kindSource: "dom" },
];
const form: FormSpec = { id: "A", title: "Order", fields };
const PASTE = "Please send 2 notebooks to Tia Ramadhani, 0813 0000 1111, Jl. Kopo 9, Bandung";
const opts = { today: "2026-11-22", timeoutMs: 200, batchMax: 6 };

describe("unplug must fail", () => {
  it("control: with the model plugged in, the fill returns the model's values with its inference source", async () => {
    plugged.on = true;
    const out = await fillForm(form, PASTE, opts);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ status: "ok", values: { name: "Tia Ramadhani", phone: "081300001111" }, inferenceSource: "on_device" });
  });

  it("with AI Logic removed, every batch reports an error naming the cause and no value is produced", async () => {
    plugged.on = false;
    const out = await fillForm(form, PASTE, opts);
    expect(out.length).toBeGreaterThan(0);
    for (const b of out) {
      expect(b.status).toBe("error");
      expect(b.error).toContain("AI Logic unplugged");
      expect(b.values).toEqual({});
      expect(b.inferenceSource).toBeUndefined();
      expect(b.attempts).toBe(2); // one retry on a fresh instance, then it stops: nothing quietly succeeds
    }
  });

  it("the paste contains every answer in plain sight, and still nothing is filled without the model", async () => {
    plugged.on = false;
    const out = await fillForm(form, "name: Tia Ramadhani\nphone: 081300001111", opts);
    expect(out.flatMap((b) => Object.keys(b.values))).toEqual([]);
  });
});
