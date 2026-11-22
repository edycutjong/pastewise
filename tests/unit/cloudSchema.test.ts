import { describe, expect, it } from "vitest";
import { toCloudSchema } from "@/ai/models";

describe("toCloudSchema (consent path)", () => {
  it("drops the blank enum option the cloud API rejects, keeps the real ones", () => {
    const s = JSON.parse(JSON.stringify(toCloudSchema({ properties: { svc: { type: "string", enum: ["", "STD", "EXP", "SDD"] }, name: { type: "string" } } }))) as {
      properties: Record<string, { enum?: string[]; type: string }>;
    };
    expect(s.properties.svc.enum).toEqual(["STD", "EXP", "SDD"]);
    expect(s.properties.name.type).toBe("string");
  });
});
