"use client";
// P1a SDK spike: proves each Firebase call end-to-end in a real browser.
// Driven by scripts/spike/run.mjs through window.__pwSpike.
import { useEffect, useState } from "react";
import { fetchAndActivate, getAll } from "firebase/remote-config";
import { Schema } from "firebase/ai";
import { appCheckToken, firebase } from "@/lib/firebase";
import { consentModel, deviceModel, teacherModel, type JsonSchema } from "@/ai/models";

type Result = { ok: boolean; ms: number; inferenceSource?: string; text?: string; error?: string };

async function timed(fn: () => Promise<{ text: string; inferenceSource?: string }>): Promise<Result> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { ok: true, ms: Math.round(performance.now() - t0), ...r };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: String(e) };
  }
}

const api = {
  async availability(): Promise<string> {
    const LM = (globalThis as { LanguageModel?: { availability: (o?: unknown) => Promise<string> } }).LanguageModel;
    if (!LM) return "NO_API";
    return LM.availability({ expectedInputs: [{ type: "text", languages: ["en"] }] });
  },
  async appCheck(): Promise<{ ok: boolean; length: number; error?: string }> {
    try {
      const t = await appCheckToken();
      return { ok: t.length > 0, length: t.length };
    } catch (e) {
      return { ok: false, length: 0, error: String(e) };
    }
  },
  async remoteConfig(): Promise<{ ok: boolean; activated?: boolean; values?: Record<string, string>; error?: string }> {
    try {
      const { rc } = firebase();
      const activated = await fetchAndActivate(rc);
      const values = Object.fromEntries(
        Object.entries(getAll(rc)).map(([k, v]) => [k, `${v.asString()} (${v.getSource()})`]),
      );
      return { ok: true, activated, values };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },
  fillOnDevice(prompt: string, schema: JsonSchema): Promise<Result> {
    return timed(async () => {
      const r = await deviceModel(schema).generateContent(prompt);
      return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
    });
  },
  consentFill(prompt: string, schema: JsonSchema, model: string): Promise<Result> {
    const props = Object.fromEntries(Object.keys((schema.properties as object) ?? {}).map((k) => [k, Schema.string()]));
    return timed(async () => {
      const r = await consentModel(schema, Schema.object({ properties: props }), model).generateContent(prompt);
      return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
    });
  },
  teach(emptyForm: string, model: string): Promise<Result> {
    return timed(async () => {
      const r = await teacherModel(model).generateContent(
        "You explain the boxes of an EMPTY web form. For each field key, say in plain words what a person " +
          "should type there and pick the expected kind. Only the form structure is given; there is no customer data.\n\n" +
          emptyForm,
      );
      return { text: r.response.text(), inferenceSource: r.response.inferenceSource };
    });
  },
};

declare global {
  interface Window {
    __pwSpike?: typeof api;
  }
}

export default function SpikeClient() {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    firebase();
    window.__pwSpike = api;
    // Signal readiness after mount (probes exist only in the browser).
    queueMicrotask(() => setStatus("ready"));
  }, []);

  // Synchronous checks first, then initializeDeviceModel inside the click (user activation).
  function onPrepare() {
    const LM = (globalThis as { LanguageModel?: unknown }).LanguageModel;
    if (!LM) {
      setStatus("init: NO_API");
      return;
    }
    const model = deviceModel({ type: "object", properties: {} });
    setStatus("init: started");
    model
      .initializeDeviceModel((p) => setStatus(`init: downloading ${Math.round(p * 100)}%`))
      .then(() => setStatus("init: done"))
      .catch((e) => setStatus(`init: error ${String(e)}`));
  }

  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>Pastewise SDK spike</h1>
      <button id="prepare" onClick={onPrepare}>
        Prepare on-device model
      </button>
      <p id="status">{status}</p>
    </main>
  );
}
