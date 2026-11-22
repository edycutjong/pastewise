import type { Span } from "./normalize";

export type Reason =
  | "not_in_text" // the value is not in the message
  | "format" // the value is in the wrong shape for this box
  | "too_long" // the value is in the message but longer than the box allows
  | "two_candidates" // two or more phone numbers in the message
  | "year_assumed" // the message gives day + month only
  | "more_than_one_name"
  | "too_few_words" // a note that is only greetings / politeness
  | "check_by_hand" // release rule: this box is always the person's to confirm (bench accepted-wrong above 5%)
  | "timed_out"
  | "invalid_answer";

export type GateResult = {
  state: "found" | "amber" | "empty";
  /** the value the box shows (cleaned); "" when empty */
  value: string;
  /** the model's raw value, kept for the record */
  proposed: string;
  reason?: Reason;
  /** candidate values as written in the message (two_candidates) */
  candidates?: { value: string; display: string; span: Span }[];
  /** year_assumed: the year code chose */
  year?: number;
  /** where the accepted value sits in the original paste */
  spans: Span[];
};

export const found = (value: string, proposed: string, spans: Span[]): GateResult => ({ state: "found", value, proposed, spans });
export const amber = (reason: Reason, value: string, proposed: string, extra: Partial<GateResult> = {}): GateResult => ({
  state: "amber",
  value,
  proposed,
  reason,
  spans: [],
  ...extra,
});
export const empty = (proposed = ""): GateResult => ({ state: "empty", value: "", proposed, spans: [] });
