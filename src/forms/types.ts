// Shared field model. A FieldSpec is what the schema builder reads from a live
// form's DOM; the prompt, the JSON schema and the code gate all derive from it.

/** Validator kinds. The teacher may only pick from this list (src/ai/teacher.ts). */
export const KINDS = ["text", "name", "phone", "postal", "date", "email", "int", "enum", "address", "notes"] as const;
export type Kind = (typeof KINDS)[number];

/** Cleanup role for free-text fields: decides which cleanup rules the gate applies. */
export type Role = "plain" | "name" | "address" | "item" | "notes";

export type FieldSpec = {
  key: string; // the input's name attribute
  label: string; // printed caption (label[for] text, aria-label or placeholder)
  kind: Kind;
  role: Role;
  /** where the kind came from: DOM attributes always outrank a teacher hint */
  kindSource: "dom" | "hint" | "default";
  options?: { value: string; text: string }[];
  maxLength?: number;
  placeholder?: string;
  /** plain-words meaning from the teacher, if hints are on */
  hint?: string;
};

export type FormSpec = { id: string; title: string; fields: FieldSpec[] };
