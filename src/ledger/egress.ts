"use client";
// Egress ledger: wraps fetch, XMLHttpRequest, navigator.sendBeacon and
// WebSocket BEFORE Firebase initialises, and records every outbound request
// with the number of paste-text bytes found in it. This is the in-page half of
// the 0-bytes receipt; scripts/egress_check.mjs is the external half (CDP log
// across all frames, which also covers the reCAPTCHA iframe this cannot see).
import { pasteTokens, tokensFound } from "./tokens";

export type LedgerRecord = {
  t: number; // ms since page load
  api: "fetch" | "xhr" | "beacon" | "websocket";
  host: string;
  purpose: string;
  size: number; // bytes of URL + body
  pasteBytesFound: number;
  hits: number; // distinct paste tokens found (the tokens themselves are never stored)
  runId: string | null;
  unreadable?: boolean; // body type the ledger cannot read (stream): counted as a blind spot
};

type Run = { runId: string; tokens: string[] };
const runs: Run[] = [];
const records: LedgerRecord[] = [];
const listeners = new Set<() => void>();
let installed = false;

export function purposeOf(host: string): string {
  if (/firebasevertexai|firebaseml|generativelanguage|aiplatform/.test(host)) return "AI Logic (cloud model)";
  if (/firebaseremoteconfig/.test(host)) return "Remote Config";
  if (/firebaseappcheck|content-firebaseappcheck/.test(host)) return "App Check";
  if (/recaptcha|google\.com|gstatic/.test(host)) return "reCAPTCHA";
  if (/firestore/.test(host)) return "Firestore";
  if (/firebaseinstallations/.test(host)) return "Firebase installation id";
  if (typeof location !== "undefined" && host === location.host) return "this site";
  return "other";
}

/** Registers a run's paste so every later request is checked against it too. */
export function trackRun(runId: string, paste: string, vocab: string[]) {
  runs.push({ runId, tokens: pasteTokens(paste, vocab) });
}

function record(api: LedgerRecord["api"], url: string, body: string, unreadable = false) {
  let host = "";
  try {
    host = new URL(url, location.href).host;
  } catch {
    host = "(unparsed)";
  }
  const text = `${url}\n${body}`;
  let best = { bytes: 0, hits: 0, runId: null as string | null };
  for (const r of runs) {
    const f = tokensFound(text, r.tokens);
    if (f.bytes > best.bytes) best = { bytes: f.bytes, hits: f.hits.length, runId: r.runId };
  }
  records.push({
    t: Math.round(performance.now()),
    api,
    host,
    purpose: purposeOf(host),
    size: new TextEncoder().encode(text).length - 1,
    pasteBytesFound: best.bytes,
    hits: best.hits,
    runId: best.runId,
    unreadable: unreadable || undefined,
  });
  listeners.forEach((l) => l());
}

async function bodyText(body: unknown): Promise<{ text: string; unreadable: boolean }> {
  if (body == null) return { text: "", unreadable: false };
  if (typeof body === "string") return { text: body, unreadable: false };
  if (body instanceof URLSearchParams) return { text: body.toString(), unreadable: false };
  if (body instanceof Blob) return { text: await body.text(), unreadable: false };
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
    return { text: new TextDecoder().decode(body as ArrayBuffer), unreadable: false };
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const parts: string[] = [];
    for (const [k, v] of body.entries()) parts.push(`${k}=${typeof v === "string" ? v : await v.text()}`);
    return { text: parts.join("&"), unreadable: false };
  }
  return { text: "", unreadable: true };
}

export function installLedger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let b = await bodyText(init?.body);
    if (!init?.body && input instanceof Request) b = { text: await input.clone().text(), unreadable: false };
    record("fetch", url, b.text, b.unreadable);
    return origFetch(input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __pwUrl?: string }, ...args: unknown[]) {
    this.__pwUrl = String(args[1]);
    return (open as (...a: unknown[]) => void).apply(this, args);
  };
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __pwUrl?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
    const sync = typeof body === "string" || body == null || body instanceof URLSearchParams;
    record("xhr", this.__pwUrl ?? "", sync ? String(body ?? "") : "", !sync);
    return send.call(this, body as XMLHttpRequestBodyInit);
  };
  if (navigator.sendBeacon) {
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const sync = typeof data === "string" || data == null || data instanceof URLSearchParams;
      record("beacon", String(url), sync ? String(data ?? "") : "", !sync);
      return beacon(url, data);
    };
  }
  const WS = window.WebSocket;
  window.WebSocket = class extends WS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      record("websocket", String(url), "");
    }
    send(data: Parameters<WebSocket["send"]>[0]) {
      record("websocket", this.url, typeof data === "string" ? data : "", typeof data !== "string");
      super.send(data);
    }
  } as typeof WebSocket;
}

export const ledger = {
  records: () => records.slice(),
  totalPasteBytes: () => records.reduce((n, r) => n + r.pasteBytesFound, 0),
  /** cheap snapshot key for useSyncExternalStore */
  version: () => `${records.length}:${records.reduce((n, r) => n + r.pasteBytesFound, 0)}`,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
