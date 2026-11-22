// Synthetic sample messages (invented people, 5550-block phones) so a visitor can try a fill with no message of their own.
import s1 from "../../fixtures/demo/S1.json";
import s2 from "../../fixtures/demo/S2.json";
import s3 from "../../fixtures/demo/S3.json";
import s4 from "../../fixtures/demo/S4.json";

export type Sample = { id: string; label: string; form: string; paste: string };

export const SAMPLES: Sample[] = [
  { id: "S1", label: "Gift order with two phone numbers", form: s1.form, paste: s1.paste },
  { id: "S2", label: "Hotel booking email", form: s2.form, paste: s2.paste },
  { id: "S3", label: "Plain order", form: s3.form, paste: s3.paste },
  { id: "S4", label: "Message that tries to hijack the form", form: s4.form, paste: s4.paste },
];
