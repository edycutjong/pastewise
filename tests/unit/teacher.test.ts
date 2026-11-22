import { describe, expect, it, vi } from "vitest";
import type { FormSpec } from "@/forms/types";

// The teacher's answer is untrusted even with a responseSchema: any other shape is a controlled "no usable hints" error.
const answer = { text: "" };
vi.mock("@/ai/models", () => ({ teacherModel: () => ({ generateContent: async () => ({ response: { text: () => answer.text, inferenceSource: "in_cloud" } }) }) }));
const { teachForm } = await import("@/ai/teacher");
const form: FormSpec = { id: "C", title: "Consignment note", fields: [{ key: "cnee_nm", label: "CNEE", kind: "text", role: "plain", kindSource: "default" }] };

describe("teachForm answer shape", () => {
  it.each(["null", "[]", '"hints"', '{"hints":{}}', '{"hints":"x"}', '{"hints":[null,1,"a"]}'])("%s -> 'no usable hints', not a TypeError", async (t) => {
    answer.text = t;
    await expect(teachForm(form, "m")).rejects.toThrow(/no usable hints/);
  });
  it("a well-formed answer still works", async () => {
    answer.text = JSON.stringify({ hints: [{ key: "cnee_nm", meaning: "Name of the person receiving the parcel", expected: "name" }] });
    const r = await teachForm(form, "m");
    expect(r.hints.map((h) => h.key)).toEqual(["cnee_nm"]);
    expect(r.inferenceSource).toBe("in_cloud");
  });
});
