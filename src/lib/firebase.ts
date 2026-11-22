"use client";
// Firebase bootstrap: App Check first, then AI Logic and Remote Config.
// The App Check debug token is never in this bundle: local E2E injects
// self.FIREBASE_APPCHECK_DEBUG_TOKEN before the page loads (scripts/spike/run.mjs).
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  getToken,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";
import { getRemoteConfig, type RemoteConfig } from "firebase/remote-config";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

export const RC_DEFAULTS = {
  teacher_model: "gemini-3.5-flash-lite",
  paste_char_cap: 2000,
  fill_timeout_ms: 10000,
  batch_max_fields: 10,
  cloud_kill_switch: false,
  gate_rules_version: "3", // = GATE_VERSION in src/gate/index.ts (metadata; a unit test keeps them equal)
};

type Services = { app: FirebaseApp; appCheck: AppCheck; ai: AI; rc: RemoteConfig };
let services: Services | null = null;

export function firebase(): Services {
  if (services) return services;
  const app = getApps().length ? getApp() : initializeApp(config);
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY ?? ""),
    isTokenAutoRefreshEnabled: true,
  });
  // Limited-use tokens: each AI Logic request carries a fresh App Check token.
  const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = 60_000;
  rc.defaultConfig = RC_DEFAULTS;
  services = { app, appCheck, ai, rc };
  return services;
}

export async function appCheckToken(): Promise<string> {
  const { token } = await getToken(firebase().appCheck, false);
  return token;
}
