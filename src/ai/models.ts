"use client";
// The three AI Logic model instances Pastewise uses. Every call returns
// response.inferenceSource, which the UI shows on each fill.
import {
  getGenerativeModel,
  InferenceMode,
  Schema,
  type GenerativeModel,
  type LanguageModelCreateOptions,
} from "firebase/ai";
import { firebase } from "@/lib/firebase";

export type JsonSchema = Record<string, unknown>;

// Same session options the on-device kill test used (temperature 0, topK 1),
// plus the expected language so Chrome can refuse early instead of mid-fill.
export const DEVICE_CREATE_OPTIONS: LanguageModelCreateOptions = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
  temperature: 0,
  topK: 1,
} as LanguageModelCreateOptions;

/** Customer text: on this laptop only. No cloud fallback exists on this path. */
export function deviceModel(schema: JsonSchema): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: DEVICE_CREATE_OPTIONS,
      promptOptions: { responseConstraint: schema },
    },
  });
}

/** Same fields for the cloud half of the consent path (the on-device half takes the JSON schema as is). */
export function toCloudSchema(schema: { properties: Record<string, { type: "string"; enum?: string[] }> }): Schema {
  const properties: Record<string, Schema> = {};
  for (const [k, v] of Object.entries(schema.properties)) properties[k] = v.enum ? Schema.enumString({ enum: v.enum }) : Schema.string();
  return Schema.object({ properties });
}

/** Consent path (no Nano): asked first, then PREFER_ON_DEVICE for that one paste. */
export function consentModel(schema: JsonSchema, cloudSchema: Schema, teacherModelName: string): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: DEVICE_CREATE_OPTIONS,
      promptOptions: { responseConstraint: schema },
    },
    inCloudParams: {
      model: teacherModelName,
      generationConfig: { responseMimeType: "application/json", responseSchema: cloudSchema, temperature: 0 },
    },
  });
}

/** Form teacher: reads only the EMPTY form (labels, names, options) and returns hints. */
export const HINTS_SCHEMA = Schema.object({
  properties: {
    hints: Schema.array({
      items: Schema.object({
        properties: {
          key: Schema.string(),
          meaning: Schema.string(),
          expected: Schema.enumString({
            enum: ["text", "name", "phone", "postal", "date", "email", "int", "enum", "address", "notes"],
          }),
        },
      }),
    }),
  },
});

export function teacherModel(teacherModelName: string): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: teacherModelName,
      generationConfig: { responseMimeType: "application/json", responseSchema: HINTS_SCHEMA, temperature: 0 },
    },
  });
}
