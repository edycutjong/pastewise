"use client";
// The Fill screen: top sheet (the paste) + copy sheet (the form).
// Flow per run: snapshot the top sheet -> synchronous checks (empty, char cap,
// on-device API present) -> initializeDeviceModel inside the same click ->
// read the live form's DOM into a schema -> ONLY_ON_DEVICE fill per batch ->
// code gate per field -> carbon blue (found in your text) or amber (reason).
import { installLedger, ledger, markConsentRun, trackRun } from "@/ledger/egress";
installLedger(); // must run before Firebase makes its first request

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fetchAndActivate } from "firebase/remote-config";
import { firebase, RC_DEFAULTS } from "@/lib/firebase";
import { deviceModel } from "@/ai/models";
import { fillForm, type BatchResult } from "@/ai/fill";
import { PROMPT_VERSION, buildPrompt } from "@/ai/prompt";
import { teachForm, teacherPayload, type TeachResult } from "@/ai/teacher";
import type { Consent } from "@/ai/fill";
import { rcNumber, rcString, cloudKillSwitch, rcSnapshot, refreshCloudKill } from "@/lib/rc";
import { withTimeout } from "@/lib/timeout";
import { formFingerprint } from "@/hints/fingerprint";
import { readSaved } from "@/hints/store";
import ConsentSheet, { type ConsentState } from "./ConsentSheet";
import FirstRunOverlay from "./FirstRunOverlay";
import TeachDrawer, { type Taught } from "./TeachDrawer";
import type { ReplayData } from "./Replay";
import { SAMPLES } from "../forms/samples";
import replayS1 from "../../evidence/replay/s1.json";
import { FORMS, formById, type InputDef } from "@/forms/defs";
import type { FormSpec } from "@/forms/types";
import { batches as splitBatches, readForm, type Hint } from "@/schema/buildSchema";
import { gateField, GATE_VERSION } from "@/gate";
import LedgerStrip from "./LedgerStrip";
import SiteNav from "./SiteNav";
import { boxClass, countBoxes, mergeBatch, rowForCopy, stateNote, type Box, type FormRun } from "./runState";
import { pasteTokens, tokensFound } from "@/ledger/tokens";

type Phase = "idle" | "reading" | "retrying" | "preparing";

export type RunRecord = {
  runId: string;
  form: string;
  promptVersion: string;
  gateVersion: string;
  today: string;
  pasteChars: number;
  hints: number;
  cold: boolean;
  done: boolean;
  discarded: boolean;
  totalMs: number;
  batches: Omit<BatchResult, "values">[];
  fields: Record<string, { proposed: string; state: string; value: string; reason?: string; candidates?: string[] }>;
  error?: string;
};

function todayLocal(): string {
  const o = (globalThis as { __pastewiseToday?: string }).__pastewiseToday;
  if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return o;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const vocabOf = (spec: FormSpec) => [spec.title, ...spec.fields.flatMap((f) => [f.key, f.label, f.placeholder ?? "", ...(f.options ?? []).flatMap((o) => [o.value, o.text])])];
const fmt = (n: number) => n.toLocaleString("en-US");
const clock = () => performance.now();

type LM = { availability: (o?: unknown) => Promise<string> };
const DEVICE_AVAILABILITY = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const lm = () => (globalThis as { LanguageModel?: LM }).LanguageModel;

export default function FillApp() {
  const [text, setText] = useState("");
  const [active, setActive] = useState<string>("A");
  const [runs, setRuns] = useState<Record<string, FormRun | undefined>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [retryWhy, setRetryWhy] = useState<"timeout" | "invalid" | "error">("timeout");
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [mac, setMac] = useState<boolean | null>(null);
  const [cap, setCap] = useState<number>(RC_DEFAULTS.paste_char_cap);
  const [avail, setAvail] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [viaCloud, setViaCloud] = useState(false);
  const [kill, setKill] = useState(false);
  const [dlFailed, setDlFailed] = useState<string | null>(null);
  const [requestBytes, setRequestBytes] = useState(0);
  const [requestCount, setRequestCount] = useState(1);
  const [consent, setConsent] = useState<{ open: boolean; state: ConsentState; message: string }>({ open: false, state: "ask", message: "" });
  const [teachOpen, setTeachOpen] = useState(false);
  const [taught, setTaught] = useState<Record<string, Taught | undefined>>({});
  const [hintsOn, setHintsOn] = useState<Record<string, boolean>>({});
  const [teachStatus, setTeachStatus] = useState<"idle" | "sending" | "error">("idle");
  const [teachError, setTeachError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ReturnType<typeof teacherPayload> | null>(null);
  const [copied, setCopied] = useState<{ runId: string; form: string; msg: string } | null>(null);

  const formRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const runIdRef = useRef<Record<string, string>>({});
  const textRef = useRef(text);
  const activeRef = useRef(active);
  const hintsRef = useRef<Record<string, Hint[]>>({});
  const initRef = useRef<Promise<void> | null>(null);
  const filledOnce = useRef(false);
  const lastRef = useRef<RunRecord | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const consentForm = useRef<string>("A");
  const savedTried = useRef<Set<string>>(new Set());
  const sendLatch = useRef(false); // one Yes = one send, even on a double click
  const mounted = useRef(true); // leaving the page stops further model calls of a run in progress
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const phaseRef = useRef<Phase>("idle");
  const manualHints = useRef(false); // the bench/egress hooks set hints directly; the saved-copy loader then stays out of the way
  useEffect(() => {
    textRef.current = text;
    activeRef.current = active;
  }, [text, active]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const ledgerVersion = useSyncExternalStore(ledger.subscribe, ledger.version, () => "0:0");
  const records = useMemo(() => (ledgerVersion ? ledger.records() : []), [ledgerVersion]);
  const pasteBytes = records.reduce((n, r) => n + r.pasteBytesFound, 0);

  useEffect(() => {
    queueMicrotask(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)));
    const { rc } = firebase();
    fetchAndActivate(rc)
      .then(() => {
        setCap(rcNumber("paste_char_cap"));
        setKill(cloudKillSwitch());
      })
      .catch(() => {
        /* compiled-in defaults stay */
      });
    const api = lm();
    if (!api) queueMicrotask(() => setAvail("unavailable"));
    else api.availability(DEVICE_AVAILABILITY).then(setAvail, () => setAvail("unavailable"));
  }, []);

  // hints in force = the taught set for the form while its toggle is on (the toggle moves the live fill)
  useEffect(() => {
    if (manualHints.current) return;
    for (const f of FORMS) hintsRef.current[f.id] = taught[f.id] && hintsOn[f.id] !== false ? taught[f.id]!.hints : [];
  }, [taught, hintsOn]);


  const spec = useCallback(
    (formId: string): FormSpec | null => {
      const el = formRefs.current[formId];
      const def = formById(formId);
      return el ? readForm(el, def.id, def.title, hintsRef.current[formId] ?? []) : null;
    },
    [],
  );

  // the builder-seeded copy for the open form, read once (structure only; every hint is re-validated). Off for scripted runs.
  useEffect(() => {
    if ((globalThis as { __pastewiseNoSaved?: boolean }).__pastewiseNoSaved || savedTried.current.has(active)) return;
    savedTried.current.add(active);
    const s = spec(active);
    if (!s) return;
    void (async () => {
      try {
        const saved = await readSaved(await formFingerprint(s), s);
        if (saved) setTaught((p) => (p[active] ? p : { ...p, [active]: { hints: saved.hints, source: "saved", savedAt: saved.seededAt } }));
      } catch {
        /* no saved copy: the form simply fills without hints */
      }
    })();
  }, [active, spec]);

  // Read-only hooks for the bench and egress scripts (no customer data is stored here beyond the last run's gate output).
  useEffect(() => {
    const api = {
      get last() {
        return lastRef.current;
      },
      hints: (formId: string) => hintsRef.current[formId] ?? [],
      setHints: (formId: string, hints: Hint[]) => {
        manualHints.current = true;
        hintsRef.current[formId] = hints;
      },
      teach: async (formId: string): Promise<TeachResult> => {
        const s = spec(formId);
        if (!s) throw new Error("form not mounted");
        const r = await teachForm({ ...s, fields: s.fields.map((f) => ({ ...f, hint: undefined })) }, rcString("teacher_model"));
        manualHints.current = true;
        hintsRef.current[formId] = r.hints;
        return r;
      },
      schema: (formId: string) => spec(formId),
      fingerprint: async (formId: string) => {
        const s = spec(formId);
        if (!s) throw new Error("form not mounted");
        return formFingerprint(s);
      },
      tokens: (paste: string, formId: string) => {
        const s = spec(formId);
        return pasteTokens(paste, s ? vocabOf(s) : []);
      },
      scan: (t: string, tokens: string[]) => tokensFound(t, tokens),
      ledger: () => ledger.records(),
      versions: { prompt: PROMPT_VERSION, gate: GATE_VERSION },
      rc: rcSnapshot,
    };
    (window as unknown as { __pastewise: typeof api }).__pastewise = api;
  }, [spec]);

  useEffect(() => {
    if (phase === "idle") return;
    const t0 = clock();
    const id = setInterval(() => setElapsed((clock() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  function applyBatch(formId: string, runId: string, s: FormSpec, b: BatchResult, today: string) {
    setRuns((prev) => {
      const next = mergeBatch(prev[formId], runId, s.fields, b, today);
      return next === prev[formId] ? prev : { ...prev, [formId]: next };
    });
  }

  function record(r: RunRecord) {
    lastRef.current = Object.freeze(r);
  }

  function onFill() {
    if (phase !== "idle") return;
    const paste = textRef.current; // immutable snapshot taken at click time
    const formId = activeRef.current;
    setNotice(null);
    if (!paste.trim()) {
      setNotice("Paste an order or booking message into the top sheet first.");
      return;
    }
    const limit = rcNumber("paste_char_cap");
    if (paste.length > limit) {
      setNotice(`That's ${fmt(paste.length)} characters; the limit is ${fmt(limit)}. Select just the order and try again. Nothing was sent.`);
      return;
    }
    const api = lm();
    if (!api) {
      openConsent(formId, paste, "unavailable");
      return;
    }
    // initializeDeviceModel must follow a user interaction: start it now, before any await.
    if (!initRef.current) {
      const init: Promise<void> = deviceModel({ type: "object", properties: {} })
        .initializeDeviceModel((p) => setProgress(p))
        .catch((e) => {
          if (initRef.current === init) initRef.current = null; // a real failure: the next Fill starts afresh
          throw e;
        });
      init.catch(() => {}); // run() awaits it; this keeps a never-awaited rejection from going unhandled
      initRef.current = init;
    }
    const s = spec(formId);
    if (!s) return;
    const runId = crypto.randomUUID();
    runIdRef.current[formId] = runId;
    trackRun(runId, paste, vocabOf(s));
    const today = todayLocal();
    const cold = !filledOnce.current;
    setRuns((prev) => ({ ...prev, [formId]: { runId, paste, boxes: {}, batches: [], ms: 0, done: false } }));
    setPhase("preparing");
    void run(formId, runId, paste, s, today, cold, api);
  }

  /** Fresh read of the cloud switch (shared single-flight fetch in src/lib/rc.ts); a failed or slow fetch keeps the last activated
   *  value (the explicit Yes is still required either way). */
  async function refreshKill(): Promise<boolean> {
    const k = await refreshCloudKill();
    setKill(k);
    return k;
  }

  function openConsent(formId: string, paste: string, availability: string) {
    consentForm.current = formId;
    setKill(cloudKillSwitch());
    void refreshKill();
    setAvail(availability);
    const s = spec(formId);
    const today = todayLocal();
    // the whole request text: the message inside the prompt, per batch, as it would be built
    const rb = s ? splitBatches(s.fields, rcNumber("batch_max_fields")).reduce((n, b) => n + new TextEncoder().encode(buildPrompt(s.title, b, paste, today)).length, 0) : 0;
    setRequestBytes(rb);
    setRequestCount(s ? splitBatches(s.fields, rcNumber("batch_max_fields")).length : 1);
    setConsent({ open: true, state: "ask", message: paste });
  }

  async function run(formId: string, runId: string, paste: string, s: FormSpec, today: string, cold: boolean, api: LM | null, viaConsent = false): Promise<boolean> {
    const base: RunRecord = {
      runId,
      form: formId,
      promptVersion: PROMPT_VERSION,
      gateVersion: GATE_VERSION,
      today,
      pasteChars: paste.length,
      hints: s.fields.filter((f) => f.hint).length,
      cold,
      done: false,
      discarded: false,
      totalMs: 0,
      batches: [],
      fields: {},
    };
    if (!viaConsent && api) {
      const initAtStart = initRef.current; // this run waits on the init it started with, even if the ref is reset meanwhile
      try {
        const a = await api.availability(DEVICE_AVAILABILITY);
        setAvail(a);
        if (a === "unavailable") throw new Error("unavailable");
        if (a === "downloadable" || a === "downloading") setDownloading(true);
        // a model that is already downloaded must start quickly; a download may take many minutes
        const limit = a === "available" ? 60_000 : 20 * 60_000;
        await withTimeout(initAtStart ?? Promise.resolve(), limit, `the model did not start within ${limit / 1000} s (reload the page to try again)`);
        setProgress(null);
        setDownloading(false);
      } catch (e) {
        if (runIdRef.current[formId] !== runId) return false; // superseded (the person chose the cloud instead, or pressed Fill again): leave the newer run's overlay alone
        setDownloading(false);
        setProgress(null);
        setPhase("idle");
        setRuns((prev) => ({ ...prev, [formId]: undefined }));
        record({ ...base, done: true, error: String(e) });
        if (String(e).includes("unavailable")) openConsent(formId, paste, "unavailable");
        else {
          // a timed-out init stays pending (a second concurrent init is never started); a rejected one already reset itself
          setDlFailed(String(e instanceof Error ? e.message : e).slice(0, 200));
        }
        return false;
      }
      if (runIdRef.current[formId] !== runId) return false;
    }
    setPhase("reading");
    const t0 = clock();
    // the run counts only while it is still this form's latest run, the message is unchanged and its tab is still open
    const live = () => runIdRef.current[formId] === runId && textRef.current === paste && activeRef.current === formId;
    let dropped = false; // any batch that landed while the run was not live makes the whole run discarded
    let results: BatchResult[];
    try {
      results = await fillForm(s, paste, {
      today,
      timeoutMs: rcNumber("fill_timeout_ms"),
      // the first call of a page session also loads the model: only its first attempt gets twice the budget
      coldTimeoutMs: cold && !viaConsent ? rcNumber("fill_timeout_ms") * 2 : undefined,
      consent: viaConsent ? ({ teacherModel: rcString("teacher_model") } satisfies Consent) : undefined,
      // before every call (later batches and retries too): only a live, mounted run sends anything, and the consent path also
      // stops if the cloud switch is on (a replaced run's message is never sent again)
      mayDispatch: () => mounted.current && live() && (!viaConsent || !cloudKillSwitch()),
      batchMax: rcNumber("batch_max_fields"),
      onRetry: (why) => {
        setRetryWhy(why);
        setPhase("retrying");
      },
      onBatch: (b) => {
        if (live()) applyBatch(formId, runId, s, b, today);
        else dropped = true;
      },
    });
    } catch (e) {
      // fill.ts turns model errors into results; this guards anything unexpected so the button never stays locked
      setViaCloud(false);
      setNotice("Something went wrong filling the form, so nothing was filled. Try again.");
      record({ ...base, done: true, error: String(e) });
      setRuns((prev) => (prev[formId]?.runId === runId ? { ...prev, [formId]: undefined } : prev));
      setPhase("idle");
      return false;
    }
    const totalMs = Math.round(clock() - t0);
    filledOnce.current = true;
    const discarded = dropped || !live();
    if (discarded) setNotice("The message or the form changed while it was being read, so that result was dropped. Press Fill again.");
    setRuns((prev) => {
      const r = prev[formId];
      return r && r.runId === runId ? { ...prev, [formId]: { ...r, ms: totalMs, done: true, discarded } } : prev;
    });
    const values: Record<string, string> = Object.assign({}, ...results.map((b) => b.values));
    const fields: RunRecord["fields"] = {};
    for (const f of s.fields) {
      const b = results.find((x) => x.keys.includes(f.key));
      if (b?.status !== "ok") fields[f.key] = { proposed: "", state: "amber", value: "", reason: b?.status };
      else {
        const g = gateField(paste, f, values[f.key] ?? "", today);
        fields[f.key] = { proposed: g.proposed, state: g.state, value: g.value, reason: g.reason, candidates: g.candidates?.map((c) => c.value) };
      }
    }
    const answered = results.some((b) => b.status === "ok");
    record({ ...base, done: true, discarded, totalMs, batches: results.map(({ keys, status, inferenceSource, ms, attempts, raw, error, retryReason }) => ({ keys, status, inferenceSource, ms, attempts, raw, error, retryReason })), fields });
    setPhase("idle");
    setViaCloud(false);
    return answered;
  }

  /** The Yes: one message, PREFER_ON_DEVICE, counted in the ledger as "sent with your Yes". */
  async function onConsentSend() {
    if (sendLatch.current) return; // a double click is one Yes
    sendLatch.current = true;
    setConsent((c) => ({ ...c, state: "sending" })); // locks Decline and Esc before anything is awaited
    const formId = consentForm.current;
    const paste = consent.message;
    try {
      const s = spec(formId);
      if (!s || phaseRef.current !== "idle") {
        setConsent((c) => ({ ...c, state: "ask" }));
        return;
      }
      if (await refreshKill()) {
        setConsent((c) => ({ ...c, state: "ask" })); // the sheet now shows "the cloud path is off"
        return;
      }
      const runId = crypto.randomUUID();
      runIdRef.current[formId] = runId;
      trackRun(runId, paste, vocabOf(s));
      // the ledger counts this message once per AI Logic request that actually carries it (a retry sends it again; a late request
      // still counts; nothing counts if no request went out)
      markConsentRun(runId, paste);
      setRuns((prev) => ({ ...prev, [formId]: { runId, paste, boxes: {}, batches: [], ms: 0, done: false } }));
      setViaCloud(true);
      setPhase("preparing");
      const ok = await run(formId, runId, paste, s, todayLocal(), false, null, true);
      setConsent((c) => (ok ? { ...c, open: false, state: "ask" } : { ...c, open: true, state: "failed" }));
    } catch {
      setViaCloud(false);
      setPhase("idle");
      setConsent((c) => ({ ...c, open: true, state: "failed" }));
    } finally {
      sendLatch.current = false;
    }
  }

  function chooseCloudInstead() {
    const formId = activeRef.current;
    setDlFailed(null);
    runIdRef.current[formId] = crypto.randomUUID(); // the waiting run drops itself
    setRuns((prev) => ({ ...prev, [formId]: undefined }));
    setPhase("idle");
    setDownloading(false);
    openConsent(formId, textRef.current, "downloading");
  }

  function openTeach() {
    const s = spec(active);
    if (!s) return;
    setPayload(teacherPayload(s));
    setTeachStatus("idle");
    setTeachError(null);
    setTeachOpen(true);
  }

  async function sendTeach() {
    const formId = active;
    const s = spec(formId);
    if (!s) return;
    setTeachStatus("sending");
    setTeachError(null);
    let why: string;
    if (await refreshKill()) why = "the cloud is switched off right now"; // same fresh read as the consent path
    else {
      try {
        const r = await teachForm(s, rcString("teacher_model"));
        setTaught((p) => ({ ...p, [formId]: { hints: r.hints, source: "cloud", inferenceSource: r.inferenceSource, ms: r.ms } }));
        setHintsOn((p) => ({ ...p, [formId]: true }));
        setTeachStatus("idle");
        return;
      } catch {
        why = "the cloud teacher didn't answer";
      }
    }
    try {
      const saved = await readSaved(await formFingerprint(s), s);
      if (saved) {
        setTaught((p) => ({ ...p, [formId]: { hints: saved.hints, source: "saved", savedAt: saved.seededAt, fallbackWhy: why } }));
        setHintsOn((p) => ({ ...p, [formId]: true }));
        setTeachStatus("idle");
        return;
      }
    } catch {
      /* fall through to the plain error */
    }
    setTeachStatus("error");
    setTeachError(`Nothing taught: ${why}, and there is no saved copy for this form. Fill still works without hints.`);
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) setNotice("The clipboard is empty. Copy the message, or paste it into the box with ⌘V / Ctrl+V.");
      else setText(t);
    } catch {
      setNotice("The browser blocked clipboard access. Paste into the box with ⌘V / Ctrl+V instead.");
    }
  }

  function edit(key: string, value: string) {
    setCopied(null);
    setRuns((prev) => {
      const run = prev[active] ?? { runId: "manual", paste: textRef.current, boxes: {}, batches: [], ms: 0, done: true };
      const box = run.boxes[key];
      return { ...prev, [active]: { ...run, boxes: { ...run.boxes, [key]: { ...box, value, edited: true } } } };
    });
  }

  /** Hands the boxes to the clipboard as one tab-separated row (captions first). Nothing is submitted and nothing is sent. */
  async function copyBoxes() {
    const run = runs[active];
    if (!run) return;
    const r = rowForCopy(run, formById(active).inputs);
    try {
      await navigator.clipboard.writeText(r.tsv);
      const msg = r.toCheck
        ? `Copied ${r.filled} filled box${r.filled === 1 ? "" : "es"} as one row. ${r.toCheck} still amber: check ${r.toCheck === 1 ? "it" : "them"} where you paste.`
        : `Copied ${r.filled} filled box${r.filled === 1 ? "" : "es"} as one row, tab-separated: paste into a sheet or your form.`;
      setCopied({ runId: run.runId, form: active, msg });
    } catch {
      setCopied({ runId: run.runId, form: active, msg: "This browser blocked the clipboard, so nothing was copied." });
    }
  }

  const cur = runs[active];
  const stale = !!cur && (cur.paste !== text || !!cur.discarded);
  const def = formById(active);

  // underlines: accepted values of the active form's current run
  const spans = useMemo(() => {
    if (!cur || cur.paste !== text || cur.discarded) return [] as { a: number; b: number; key: string }[];
    const out: { a: number; b: number; key: string }[] = [];
    for (const [key, box] of Object.entries(cur.boxes)) {
      if (box.edited || !box.gate) continue;
      const src = box.gate.state === "found" ? box.gate.spans : key === hot ? [...box.gate.spans, ...(box.gate.candidates ?? []).map((c) => c.span)] : [];
      for (const [a, b] of src) out.push({ a, b, key });
    }
    return out.sort((x, y) => x.a - y.a);
  }, [cur, text, hot]);

  const backdrop = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let pos = 0;
    spans.forEach((s, i) => {
      if (s.a < pos) return; // overlapping span: keep the first
      parts.push(text.slice(pos, s.a));
      parts.push(
        <mark key={i} className={s.key === hot ? "hot" : undefined}>
          {text.slice(s.a, s.b)}
        </mark>,
      );
      pos = s.b;
    });
    parts.push(text.slice(pos) + "\n");
    return parts;
  }, [spans, text, hot]);

  const counts = useMemo(() => countBoxes(cur, def.inputs.map((i) => i.name)), [cur, def]);

  const toCheck = cur ? def.inputs.filter((i) => { const b = cur.boxes[i.name]; return b && !b.edited && (b.failed || b.gate?.state === "amber"); }) : [];
  const badges = cur?.batches.map((b) => b.inferenceSource ?? (b.status === "ok" ? "UNKNOWN" : "NO ANSWER")) ?? [];
  const busy = phase !== "idle";
  const shortcut = mac === null ? "⌘↵ / Ctrl+Enter" : mac ? "⌘↵" : "Ctrl+Enter";

  return (
    <>
      <header className="top">
        <h1>Pastewise</h1>
        <p>Paste a messy order message. With the on-device model the form fills on this laptop — otherwise no message text leaves unless you say Yes — and code accepts only what is in your text.</p>
      </header>
      <SiteNav current="fill" />
      <main className="desk">
        <section className="sheet" aria-label="Top sheet: your message">
          <div className="sheet-head">
            <span className="cap">Paste the message</span>
            <button type="button" className="linkish" onClick={pasteFromClipboard}>
              Paste from clipboard
            </button>
          </div>
          <div className={`paper${busy ? " reading" : ""}`}>
            <div className="backdrop" ref={backdropRef} aria-hidden="true">
              {backdrop}
            </div>
            <textarea
              id="paste"
              aria-label="The message you copied"
              placeholder="Paste any order or booking message. On a laptop with the on-device model it is read on this laptop."
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onScroll={(e) => backdropRef.current && (backdropRef.current.scrollTop = e.currentTarget.scrollTop)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onFill();
                }
              }}
            />
          </div>
          <div className="samples" role="group" aria-label="Try a sample message">
            <span className="cap">No message handy? Try one</span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="linkish"
                data-testid={`sample-${s.id}`}
                onClick={() => {
                  setActive(s.form);
                  setText(s.paste);
                  setNotice(null);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className={`count${text.length > cap ? " over" : ""}`}>
            {fmt(text.length)} / {fmt(cap)} characters
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
        </section>

        <section className="copy" aria-label="Copy sheet: the form">
          <div className="serial">{def.serial}</div>
          <div className="tabs" role="tablist" aria-label="Sample forms">
            {FORMS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={f.id === active}
                onClick={() => setActive(f.id)}
              >
                {f.tab}
              </button>
            ))}
          </div>
          {FORMS.map((f) => (
            <form
              key={f.id}
              id={`form-${f.id}`}
              ref={(el) => {
                formRefs.current[f.id] = el;
              }}
              hidden={f.id !== active}
              onSubmit={(e) => e.preventDefault()}
              aria-label={f.title}
              autoComplete="off"
            >
              <h2 className="form-title">{f.title}</h2>
              <div className="grid">
                {f.inputs.map((inp, i) => (
                  <FieldBox
                    key={inp.name}
                    formId={f.id}
                    inp={inp}
                    index={i}
                    box={runs[f.id]?.boxes[inp.name]}
                    stale={!!runs[f.id] && (runs[f.id]!.paste !== text || !!runs[f.id]!.discarded)}
                    onEdit={(v) => edit(inp.name, v)}
                    onHot={setHot}
                  />
                ))}
              </div>
            </form>
          ))}
          <div className="bar">
            <button type="button" id="fill" className="fill" onClick={onFill} aria-disabled={busy} aria-keyshortcuts="Meta+Enter Control+Enter">
              {phase === "idle"
                ? "Fill this message"
                : phase === "retrying"
                  ? `${retryWhy === "timeout" ? "Taking too long — trying" : "No usable answer — trying"} once more ${elapsed.toFixed(1)} s`
                  : phase === "preparing"
                    ? viaCloud
                      ? "Sending your one Yes…"
                      : "Starting the on-device model…"
                    : viaCloud
                      ? `Asking the cloud… ${elapsed.toFixed(1)} s`
                      : `Reading on this laptop… ${elapsed.toFixed(1)} s`}
              {phase === "idle" && <kbd>{shortcut}</kbd>}
            </button>
            <button type="button" className="teach-btn" onClick={openTeach}>
              Teach this form
            </button>
            {taught[active] && (
              <label className="toggle inline">
                <input type="checkbox" checked={hintsOn[active] !== false} onChange={(e) => setHintsOn((p) => ({ ...p, [active]: e.target.checked }))} />
                Hints {hintsOn[active] !== false ? "on" : "off"} ({taught[active]!.source === "cloud" ? "taught this session" : "saved copy"})
              </label>
            )}
            {badges.map((b, i) => (
              <span key={i} className="badge" title="inferenceSource reported by Firebase AI Logic for this batch">
                {b}
              </span>
            ))}
            {cur?.done && !stale && !cur.discarded && (
              <span className="sum">
                {counts.found} of {counts.total} found in your text · {counts.amber} to check · {counts.empty} empty
                {counts.edited ? ` · ${counts.edited} edited by you` : ""}
                {cur.ms ? ` · ${(cur.ms / 1000).toFixed(1)} s` : ""}
              </span>
            )}
            {cur?.done && !stale && !cur.discarded && (
              <button type="button" className="linkish" onClick={copyBoxes} data-testid="copy-row">
                Copy the boxes as one row
              </button>
            )}
            {copied && cur && copied.form === active && copied.runId === cur.runId && !stale && (
              <span className="sum" role="status" data-testid="copy-status">
                {copied.msg}
              </span>
            )}
            <span className="sr-only" aria-live="polite">
              {cur?.done && !stale && !cur.discarded ? `Filled ${counts.found} of ${counts.total}; ${counts.amber} to check.` : ""}
            </span>
          </div>
          {cur?.done && !stale && !cur.discarded && (
            <div className="check">
              <h2 className="cap">To check</h2>
              {toCheck.length === 0 ? (
                <p>Nothing to check — still read it before you press the form&apos;s own Submit.</p>
              ) : (
                <ol>
                  {toCheck.map((i) => (
                    <li key={i.name}>
                      <a href={`#${active}-${i.name}`}>{i.caption}</a> — {stateNote(cur.boxes[i.name], false)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <LedgerStrip bytes={pasteBytes} records={records} consentBytes={ledger.consentBytes()} />
        </section>
      </main>
      <FirstRunOverlay open={(downloading && phase === "preparing") || !!dlFailed} progress={progress} failed={dlFailed} onUseCloud={chooseCloudInstead} onClose={() => setDlFailed(null)} />
      <ConsentSheet
        open={consent.open}
        availability={avail}
        message={consent.message}
        killSwitch={kill}
        state={consent.state}
        replay={replayS1 as ReplayData}
        onSend={() => void onConsentSend()}
        requestBytes={requestBytes}
        requestCount={requestCount}
        onDecline={() => {
          setConsent((c) => ({ ...c, open: false, state: "ask" }));
          setNotice(
            consent.state === "failed"
              ? "The request that failed may still have reached the cloud — the receipt shows what left. Type the form by hand, or press Fill and say Yes again."
              : "Nothing was sent. Type the form by hand, or press Fill to ask again.",
          );
        }}
      />
      <TeachDrawer
        open={teachOpen}
        onClose={() => setTeachOpen(false)}
        formTitle={def.title}
        payload={payload}
        taught={taught[active]}
        hintsOn={hintsOn[active] !== false}
        onToggle={(on) => setHintsOn((p) => ({ ...p, [active]: on }))}
        status={teachStatus}
        error={teachError}
        killSwitch={kill}
        onSend={() => void sendTeach()}
      />
    </>
  );
}

function FieldBox(props: {
  formId: string;
  inp: InputDef;
  index: number;
  box?: Box;
  stale: boolean;
  onEdit: (v: string) => void;
  onHot: (k: string | null) => void;
}) {
  const { formId, inp, index, box, stale, onEdit, onHot } = props;
  const id = `${formId}-${inp.name}`;
  const cls = boxClass(box, stale);
  const note = stateNote(box, stale);
  const common = {
    id,
    name: inp.name,
    className: "v",
    value: box?.value ?? "",
    maxLength: inp.maxLength,
    "aria-describedby": note ? `${id}-note` : undefined,
    onFocus: () => onHot(inp.name),
    onBlur: () => onHot(null),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onEdit(e.target.value),
  };
  return (
    <div
      className={`box ${inp.wide ? "wide" : ""} ${cls}`}
      style={{ ["--i" as string]: index }}
      onMouseEnter={() => onHot(inp.name)}
      onMouseLeave={() => onHot(null)}
    >
      <label htmlFor={id} className="cap">
        {inp.caption}
      </label>
      {inp.tag === "select" ? (
        <select {...common}>
          <option value="">—</option>
          {inp.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
      ) : inp.tag === "textarea" ? (
        <textarea {...common} rows={2} />
      ) : (
        <input
          {...common}
          type={inp.type ?? "text"}
          autoComplete={inp.autoComplete ?? "off"}
          inputMode={inp.inputMode}
          pattern={inp.pattern}
          min={inp.min}
          max={inp.max}
        />
      )}
      {note && (
        <div id={`${id}-note`} className={box?.gate?.state === "found" && !box.edited ? "state-note" : box?.edited ? "state-note" : "why"}>
          {note}
        </div>
      )}
      {box?.gate?.candidates && (!box.edited || box.gate.candidates.some((c) => c.value === box.value)) && (
        <div role="group" aria-label="Numbers in your text">
          {box.gate.candidates.map((c) => (
            <button key={c.value} type="button" className="chip" aria-pressed={box.value === c.value} onClick={() => onEdit(c.value)}>
              {c.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
