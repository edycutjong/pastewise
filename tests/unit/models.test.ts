import { beforeEach, describe, expect, it, vi } from "vitest";

// Contract test for the three AI Logic model instances: customer text has no
// cloud route, and the teacher never runs on device.
const getGenerativeModel = vi.fn((_ai: unknown, params: unknown) => ({ params }));
vi.mock("firebase/ai", async (orig) => ({ ...(await orig<typeof import("firebase/ai")>()), getGenerativeModel }));
vi.mock("@/lib/firebase", () => ({ firebase: () => ({ ai: { fake: true } }) }));
const kill = { on: false };
vi.mock("@/lib/rc", () => ({ cloudKillSwitch: () => kill.on }));

const { deviceModel, consentModel, teacherModel, HINTS_SCHEMA, DEVICE_CREATE_OPTIONS } = await import("@/ai/models");
const { InferenceMode, Schema } = await import("firebase/ai");

const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
type Params = { mode: string; onDeviceParams?: { createOptions?: unknown; promptOptions?: { responseConstraint?: unknown } }; inCloudParams?: { model?: string; generationConfig?: { responseMimeType?: string; responseSchema?: unknown } } };
const lastParams = () => getGenerativeModel.mock.calls.at(-1)![1] as Params;

describe("AI Logic model instances", () => {
  beforeEach(() => getGenerativeModel.mockClear());

  it("device model is ONLY_ON_DEVICE with the form's JSON schema as responseConstraint and no cloud params", () => {
    deviceModel(schema);
    const p = lastParams();
    expect(p.mode).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toBe(schema);
    expect(p.onDeviceParams?.createOptions).toBe(DEVICE_CREATE_OPTIONS);
    expect(p.inCloudParams).toBeUndefined();
  });

  it("device session options pin English input/output and the kill-test sampling", () => {
    expect(DEVICE_CREATE_OPTIONS).toMatchObject({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      temperature: 0,
      topK: 1,
    });
  });

  it("consent model is PREFER_ON_DEVICE with a cloud responseSchema for the same fields", () => {
    const cloud = Schema.object({ properties: { name: Schema.string() } });
    consentModel(schema, cloud, "gemini-3.5-flash-lite");
    const p = lastParams();
    expect(p.mode).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(p.onDeviceParams?.promptOptions?.responseConstraint).toBe(schema);
    expect(p.inCloudParams?.model).toBe("gemini-3.5-flash-lite");
    expect(p.inCloudParams?.generationConfig?.responseSchema).toBe(cloud);
  });

  it("teacher is ONLY_IN_CLOUD with the hints responseSchema and no on-device params", () => {
    teacherModel("gemini-3.5-flash-lite");
    const p = lastParams();
    expect(p.mode).toBe(InferenceMode.ONLY_IN_CLOUD);
    expect(p.onDeviceParams).toBeUndefined();
    expect(p.inCloudParams?.generationConfig).toMatchObject({ responseMimeType: "application/json", responseSchema: HINTS_SCHEMA });
  });
});

describe("cloud kill switch: one guard where every cloud-capable instance is built", () => {
  beforeEach(() => {
    getGenerativeModel.mockClear();
    kill.on = false;
  });
  it("switch on -> no consent model and no teacher model is built, so nothing can be sent", () => {
    kill.on = true;
    const cloud = Schema.object({ properties: { name: Schema.string() } });
    expect(() => consentModel(schema, cloud, "gemini-x")).toThrow(/switched off/);
    expect(() => teacherModel("gemini-x")).toThrow(/switched off/);
    expect(getGenerativeModel).not.toHaveBeenCalled();
  });
  it("switch on does not touch the on-device path (customer text never had a cloud route)", () => {
    kill.on = true;
    deviceModel(schema);
    expect(getGenerativeModel).toHaveBeenCalledTimes(1);
  });
});
