"use client";
// The Fill screen: top sheet (the paste) + copy sheet (the form).
// Flow per run: snapshot the top sheet -> synchronous checks (empty, char cap,
// on-device API present) -> initializeDeviceModel inside the same click ->
// read the live form's DOM into a schema -> ONLY_ON_DEVICE fill per batch ->
// code gate per field -> carbon blue (found in your text) or amber (reason).
import { installLedger, ledger, trackRun } from "@/ledger/egress";
installLedger(); // must run before Firebase makes its first request

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { firebase, RC_DEFAULTS } from "@/lib/firebase";
import { deviceModel } from "@/ai/models";
import { fillForm, type BatchResult } from "@/ai/fill";
import { PROMPT_VERSION } from "@/ai/prompt";
import { teachForm, type TeachResult } from "@/ai/teacher";
import { FORMS, formById, type InputDef } from "@/forms/defs";
import type { FormSpec } from "@/forms/types";
import { readForm, type Hint } from "@/schema/buildSchema";
import { gateField, GATE_VERSION, REASON_TEXT, type GateResult } from "@/gate";
import { pasteTokens, tokensFound } from "@/ledger/tokens";

type Box = { value: string; gate?: GateResult; edited?: boolean; failed?: "timed_out" | "invalid" };
type FormRun = { runId: string; paste: string; boxes: Record<string, Box>; batches: BatchResult[]; ms: number; done: boolean; discarded?: boolean };
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

const NO_NANO =
  "This browser can't run the on-device model (Chrome's built-in AI), so nothing was filled and nothing was sent anywhere.";

function todayLocal(): string {
  const o = (globalThis as { __pastewiseToday?: string }).__pastewiseToday;
  if (o && /^\d{4}-\d{2}-\d{2}$/.test(o)) return o;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rcNumber(key: "paste_char_cap" | "fill_timeout_ms" | "batch_max_fields"): number {
  try {
    const v = getValue(firebase().rc, key).asNumber();
    return v > 0 ? v : RC_DEFAULTS[key];
  } catch {
    return RC_DEFAULTS[key];
  }
}
const rcString = (key: "teacher_model") => {
  try {
    return getValue(firebase().rc, key).asString() || RC_DEFAULTS[key];
  } catch {
    return RC_DEFAULTS[key];
  }
};

const vocabOf = (spec: FormSpec) => [spec.title, ...spec.fields.flatMap((f) => [f.key, f.label, f.placeholder ?? "", ...(f.options ?? []).flatMap((o) => [o.value, o.text])])];
const fmt = (n: number) => n.toLocaleString("en-US");
const clock = () => performance.now();

type LM = { availability: (o?: unknown) => Promise<string> };
const lm = () => (globalThis as { LanguageModel?: LM }).LanguageModel;

function boxClass(box: Box | undefined, stale: boolean): string {
  if (!box) return "";
  if (box.edited) return "edited";
  if (box.failed) return "amber";
  if (!box.gate) return "";
  if (box.gate.state === "found") return stale ? "found stale" : "found";
  if (box.gate.state === "amber") return "amber";
  return "";
}

function stateNote(box: Box | undefined, stale: boolean): string {
  if (!box) return "";
  if (box.edited) return box.gate?.candidates?.some((c) => c.value === box.value) ? "picked by you" : "edited by you";
  if (box.failed) return REASON_TEXT[box.failed];
  const g = box.gate;
  if (!g) return "";
  if (g.state === "found") return stale ? "from the previous message, fill again" : "found in your text";
  if (g.state === "empty") return "";
  if (g.reason === "year_assumed") return `year assumed: ${g.year} — check it`;
  const why = REASON_TEXT[g.reason ?? "not_in_text"];
  return g.proposed && g.reason !== "two_candidates" ? `${why} — the model suggested “${g.proposed.slice(0, 60)}”` : why;
}

export default function FillApp() {
  const [text, setText] = useState("");
  const [active, setActive] = useState<string>("A");
  const [runs, setRuns] = useState<Record<string, FormRun | undefined>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [mac, setMac] = useState<boolean | null>(null);
  const [cap, setCap] = useState<number>(RC_DEFAULTS.paste_char_cap);

  const formRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const runIdRef = useRef<Record<string, string>>({});
  const textRef = useRef(text);
  const activeRef = useRef(active);
  const hintsRef = useRef<Record<string, Hint[]>>({});
  const initRef = useRef<Promise<void> | null>(null);
  const filledOnce = useRef(false);
  const lastRef = useRef<RunRecord | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    textRef.current = text;
    activeRef.current = active;
  }, [text, active]);

  const ledgerVersion = useSyncExternalStore(ledger.subscribe, ledger.version, () => "0:0");
  const records = useMemo(() => (ledgerVersion ? ledger.records() : []), [ledgerVersion]);
  const pasteBytes = records.reduce((n, r) => n + r.pasteBytesFound, 0);

  useEffect(() => {
    queueMicrotask(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)));
    const { rc } = firebase();
    fetchAndActivate(rc)
      .then(() => setCap(rcNumber("paste_char_cap")))
      .catch(() => {
        /* compiled-in defaults stay */
      });
  }, []);

  const spec = useCallback(
    (formId: string): FormSpec | null => {
      const el = formRefs.current[formId];
      const def = formById(formId);
      return el ? readForm(el, def.id, def.title, hintsRef.current[formId] ?? []) : null;
    },
    [],
  );

  // Read-only hooks for the bench and egress scripts (no customer data is stored here beyond the last run's gate output).
  useEffect(() => {
    const api = {
      get last() {
        return lastRef.current;
      },
      hints: (formId: string) => hintsRef.current[formId] ?? [],
      setHints: (formId: string, hints: Hint[]) => {
        hintsRef.current[formId] = hints;
      },
      teach: async (formId: string): Promise<TeachResult> => {
        const s = spec(formId);
        if (!s) throw new Error("form not mounted");
        const r = await teachForm({ ...s, fields: s.fields.map((f) => ({ ...f, hint: undefined })) }, rcString("teacher_model"));
        hintsRef.current[formId] = r.hints;
        return r;
      },
      schema: (formId: string) => spec(formId),
      tokens: (paste: string, formId: string) => {
        const s = spec(formId);
        return pasteTokens(paste, s ? vocabOf(s) : []);
      },
      scan: (t: string, tokens: string[]) => tokensFound(t, tokens),
      ledger: () => ledger.records(),
      versions: { prompt: PROMPT_VERSION, gate: GATE_VERSION },
    };
    (window as unknown as { __pastewise: typeof api }).__pastewise = api;
  }, [spec]);

  useEffect(() => {
    if (phase === "idle") return;
    const t0 = clock();
    const id = setInterval(() => setElapsed((clock() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [phase]);

  function applyBatch(formId: string, runId: string, paste: string, s: FormSpec, b: BatchResult, today: string) {
    setRuns((prev) => {
      const run = prev[formId];
      if (!run || run.runId !== runId) return prev;
      const boxes = { ...run.boxes };
      for (const f of s.fields.filter((x) => b.keys.includes(x.key))) {
        if (boxes[f.key]?.edited) continue; // never overwrite what the person typed
        if (b.status === "ok") {
          const gate = gateField(paste, f, b.values[f.key] ?? "", today);
          boxes[f.key] = { value: gate.value, gate };
        } else boxes[f.key] = { value: "", failed: b.status };
      }
      return { ...prev, [formId]: { ...run, boxes, batches: [...run.batches, b] } };
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
      setNotice(NO_NANO);
      return;
    }
    // initializeDeviceModel must follow a user interaction: start it now, before any await.
    if (!initRef.current) {
      initRef.current = deviceModel({ type: "object", properties: {} })
        .initializeDeviceModel((p) => setProgress(p))
        .catch((e) => {
          initRef.current = null;
          throw e;
        });
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

  async function run(formId: string, runId: string, paste: string, s: FormSpec, today: string, cold: boolean, api: LM) {
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
    try {
      const a = await api.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });
      if (a === "unavailable") throw new Error("unavailable");
      await initRef.current;
      setProgress(null);
    } catch (e) {
      setNotice(NO_NANO);
      setPhase("idle");
      setRuns((prev) => ({ ...prev, [formId]: undefined }));
      record({ ...base, done: true, error: String(e) });
      return;
    }
    setPhase("reading");
    const t0 = clock();
    const results = await fillForm(s, paste, {
      today,
      // the first call of a session also loads the model: it gets twice the budget
      timeoutMs: rcNumber("fill_timeout_ms") * (cold ? 2 : 1),
      batchMax: rcNumber("batch_max_fields"),
      onRetry: () => setPhase("retrying"),
      onBatch: (b) => {
        if (runIdRef.current[formId] === runId && textRef.current === paste) applyBatch(formId, runId, paste, s, b, today);
      },
    });
    const totalMs = Math.round(clock() - t0);
    filledOnce.current = true;
    const discarded = runIdRef.current[formId] !== runId || textRef.current !== paste;
    if (discarded) setNotice("The message changed while it was being read, so that result was dropped. Press Fill again.");
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
    record({ ...base, done: true, discarded, totalMs, batches: results.map(({ keys, status, inferenceSource, ms, attempts, raw, error }) => ({ keys, status, inferenceSource, ms, attempts, raw, error })), fields });
    setPhase("idle");
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
    setRuns((prev) => {
      const run = prev[active] ?? { runId: "manual", paste: textRef.current, boxes: {}, batches: [], ms: 0, done: true };
      const box = run.boxes[key];
      return { ...prev, [active]: { ...run, boxes: { ...run.boxes, [key]: { ...box, value, edited: true } } } };
    });
  }

  const cur = runs[active];
  const stale = !!cur && cur.paste !== text;
  const def = formById(active);

  // underlines: accepted values of the active form's current run
  const spans = useMemo(() => {
    if (!cur || cur.paste !== text) return [] as { a: number; b: number; key: string }[];
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

  const counts = useMemo(() => {
    const c = { found: 0, amber: 0, empty: 0, total: def.inputs.length };
    if (!cur) return c;
    for (const i of def.inputs) {
      const b = cur.boxes[i.name];
      if (!b) continue;
      if (b.failed || b.gate?.state === "amber") c.amber++;
      else if (b.gate?.state === "found") c.found++;
      else if (b.gate?.state === "empty") c.empty++;
    }
    return c;
  }, [cur, def]);

  const toCheck = cur ? def.inputs.filter((i) => { const b = cur.boxes[i.name]; return b && !b.edited && (b.failed || b.gate?.state === "amber"); }) : [];
  const badges = cur?.batches.map((b) => b.inferenceSource ?? (b.status === "ok" ? "UNKNOWN" : "NO ANSWER")) ?? [];
  const busy = phase !== "idle";
  const shortcut = mac === null ? "⌘↵ / Ctrl+Enter" : mac ? "⌘↵" : "Ctrl+Enter";

  return (
    <>
      <header className="top">
        <h1>Pastewise</h1>
        <p>Paste a messy order message. The form fills on this laptop, and code accepts only what is in your text.</p>
      </header>
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
          <div className={`count${text.length > cap ? " over" : ""}`}>
            {fmt(text.length)} / {fmt(cap)} characters
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {progress !== null && progress < 1 && (
            <div className="notice" role="status">
              Getting the on-device model ready — this happens once and can take several minutes: {Math.round(progress * 100)}%
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
                    stale={!!runs[f.id] && runs[f.id]!.paste !== text}
                    onEdit={(v) => edit(inp.name, v)}
                    onHot={setHot}
                  />
                ))}
              </div>
            </form>
          ))}
          <div className="bar">
            <button type="button" id="fill" className="fill" onClick={onFill} disabled={busy} aria-keyshortcuts="Meta+Enter Control+Enter">
              {phase === "idle"
                ? "Fill this message"
                : phase === "retrying"
                  ? `Taking too long — trying once more ${elapsed.toFixed(1)} s`
                  : phase === "preparing"
                    ? "Starting the on-device model…"
                    : `Reading on this laptop… ${elapsed.toFixed(1)} s`}
              {phase === "idle" && <kbd>{shortcut}</kbd>}
            </button>
            {badges.map((b, i) => (
              <span key={i} className="badge" title="inferenceSource reported by Firebase AI Logic for this batch">
                {b}
              </span>
            ))}
            {cur?.done && !stale && (
              <span className="sum">
                {counts.found} of {counts.total} found in your text · {counts.amber} to check · {counts.empty} empty
                {cur.ms ? ` · ${(cur.ms / 1000).toFixed(1)} s` : ""}
              </span>
            )}
            <span className="sr-only" aria-live="polite">
              {cur?.done ? `Filled ${counts.found} of ${counts.total}; ${counts.amber} to check.` : ""}
            </span>
          </div>
          {cur?.done && !stale && (
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
          <LedgerStrip bytes={pasteBytes} records={records} />
        </section>
      </main>
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
      {!box?.edited && box?.gate?.candidates && (
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

function LedgerStrip({ bytes, records }: { bytes: number; records: ReturnType<typeof ledger.records> }) {
  return (
    <div className="strip" id="ledger">
      <div className="strip-row">
        <span className="cap">Text from your paste sent to the cloud</span>
        <b data-testid="ledger-bytes">{fmt(bytes)} bytes found</b>
      </div>
      <details>
        <summary>
          {records.length} outbound request{records.length === 1 ? "" : "s"} this session, each checked for words and numbers from your paste
        </summary>
        <table>
          <thead>
            <tr>
              <th>t (ms)</th>
              <th>host</th>
              <th>purpose</th>
              <th>bytes</th>
              <th>paste bytes found</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.t}</td>
                <td>{r.host}</td>
                <td>{r.purpose}</td>
                <td>{fmt(r.size)}</td>
                <td>{r.unreadable ? "unreadable body" : fmt(r.pasteBytesFound)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Counting rule: words of 4+ letters and digit runs of 4+ digits from your paste, minus the empty form&apos;s own labels and
          common words. Not caught: shorter pieces, text changed before sending, and the reCAPTCHA frame (the recorded browser network log
          in this repo covers those).
        </p>
      </details>
    </div>
  );
}
