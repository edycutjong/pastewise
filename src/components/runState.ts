// Pure run-state logic for the Fill screen (unit-tested in tests/unit/runState.test.ts):
// merging a batch into a run without overwriting what the person typed,
// counting states for the summary, and the box class / note text.
import type { BatchResult } from "@/ai/fill";
import type { FieldSpec } from "@/forms/types";
import { gateField, REASON_TEXT, type GateResult } from "@/gate";

export type Box = { value: string; gate?: GateResult; edited?: boolean; failed?: "timed_out" | "invalid" | "error" | "not_sent" };
export type FormRun = { runId: string; paste: string; boxes: Record<string, Box>; batches: BatchResult[]; ms: number; done: boolean; discarded?: boolean };

/** Applies one batch to the run it belongs to. A different run id -> unchanged; an edited box is never overwritten. */
export function mergeBatch(run: FormRun | undefined, runId: string, fields: FieldSpec[], b: BatchResult, today: string): FormRun | undefined {
  if (!run || run.runId !== runId) return run;
  const boxes = { ...run.boxes };
  for (const f of fields.filter((x) => b.keys.includes(x.key))) {
    if (boxes[f.key]?.edited) continue;
    if (b.status === "ok") {
      const gate = gateField(run.paste, f, b.values[f.key] ?? "", today);
      boxes[f.key] = { value: gate.value, gate };
    } else boxes[f.key] = { value: "", failed: b.status };
  }
  return { ...run, boxes, batches: [...run.batches, b] };
}

/**
 * A cell that a spreadsheet would read as a formula (it starts with =, +, - or @) is copied with a leading apostrophe, the usual
 * CSV/formula-injection defence: spreadsheets read the cell as text instead of running it. The gate accepts a value because it IS in the paste, so a
 * message can carry `=HYPERLINK(...)` or `=IMPORTXML(...)` into a notes box word for word; the copy must not let the sheet run it.
 * It also keeps "+62 811 5550 4471" a phone number instead of a formula parse error.
 */
const FORMULA_START = /^[=+\-@]/;

/**
 * The boxes as they stand, for pasting into a spreadsheet: a header row of captions and a row of values, tab-separated.
 * Amber boxes the person has not touched are copied as they stand (a name suggestion, or empty) and named by caption,
 * so the status line can say which columns still need a look. Pastewise never submits anything; this only writes the clipboard.
 */
export function rowForCopy(run: FormRun | undefined, columns: { name: string; caption: string }[]) {
  const cell = (v: string) => {
    const t = v.replace(/[\t\r\n]+/g, " ").trim();
    return FORMULA_START.test(t) ? `'${t}` : t;
  };
  const values = columns.map((c) => cell(run?.boxes[c.name]?.value ?? ""));
  const amber = columns
    .filter((c) => {
      const b = run?.boxes[c.name];
      return !!b && !b.edited && (!!b.failed || b.gate?.state === "amber");
    })
    .map((c) => c.caption);
  return { tsv: `${columns.map((c) => cell(c.caption)).join("\t")}\n${values.join("\t")}`, filled: values.filter(Boolean).length, amber };
}

/** Summary counts; a box the person edited is counted as edited, never as found or to-check. */
export function countBoxes(run: FormRun | undefined, keys: string[]) {
  const c = { found: 0, amber: 0, empty: 0, edited: 0, total: keys.length };
  if (!run) return c;
  for (const k of keys) {
    const b = run.boxes[k];
    if (!b) continue;
    if (b.edited) c.edited++;
    else if (b.failed || b.gate?.state === "amber") c.amber++;
    else if (b.gate?.state === "found") c.found++;
    else if (b.gate?.state === "empty") c.empty++;
  }
  return c;
}

export function boxClass(box: Box | undefined, stale: boolean): string {
  if (!box) return "";
  if (box.edited) return "edited";
  if (box.failed) return stale ? "amber stale" : "amber";
  if (!box.gate) return "";
  if (box.gate.state === "found") return stale ? "found stale" : "found";
  if (box.gate.state === "amber") return stale ? "amber stale" : "amber";
  return "";
}

export function stateNote(box: Box | undefined, stale: boolean): string {
  if (!box) return "";
  if (box.edited) return box.gate?.candidates?.some((c) => c.value === box.value) ? "picked by you" : "edited by you";
  if (stale && (box.failed || box.gate?.state === "found" || box.gate?.state === "amber")) return "from the previous message, fill again";
  if (box.failed) return REASON_TEXT[box.failed];
  const g = box.gate;
  if (!g) return "";
  if (g.state === "found") return "found in your text";
  if (g.state === "empty") return "";
  if (g.reason === "year_assumed") return `year assumed: ${g.year} — check it`;
  const why = REASON_TEXT[g.reason ?? "not_in_text"];
  return g.proposed && g.reason !== "two_candidates" ? `${why} — the model suggested “${g.proposed.slice(0, 60)}”` : why;
}
