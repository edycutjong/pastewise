// The three sample forms on the hosted page. These are plain HTML attribute
// lists: the app renders them as real <form> elements and the schema builder
// reads the rendered DOM back (it never reads this file), the same way it
// would read any other form.

export type InputDef = {
  name: string;
  caption: string;
  tag?: "input" | "select" | "textarea";
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "tel" | "email" | "text";
  pattern?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; text: string }[];
  wide?: boolean;
};

export type FormDef = { id: "A" | "B" | "C"; tab: string; title: string; serial: string; inputs: InputDef[] };

export const FORMS: FormDef[] = [
  {
    id: "A",
    tab: "A · ORDER",
    title: "Shipping / order form",
    serial: "Nº 0417-A",
    inputs: [
      { name: "name", caption: "Recipient name", autoComplete: "name", maxLength: 80 },
      { name: "phone", caption: "Phone", type: "tel", autoComplete: "tel", maxLength: 20 },
      { name: "street", caption: "Street address", autoComplete: "address-line1", maxLength: 120, wide: true },
      { name: "city", caption: "City", autoComplete: "address-level2", maxLength: 60 },
      { name: "province", caption: "Province", autoComplete: "address-level1", maxLength: 60 },
      { name: "postal_code", caption: "Postal code", autoComplete: "postal-code", inputMode: "numeric", pattern: "\\d{5}", maxLength: 5 },
      { name: "item", caption: "Item", maxLength: 120 },
      { name: "quantity", caption: "Quantity", type: "number", min: 1, max: 999 },
      { name: "notes", caption: "Delivery notes", tag: "textarea", maxLength: 200, wide: true },
    ],
  },
  {
    id: "B",
    tab: "B · FRONT DESK",
    title: "Hotel booking / front-desk form",
    serial: "Nº 0417-B",
    inputs: [
      { name: "guest_name", caption: "Guest name", autoComplete: "name", maxLength: 80 },
      { name: "phone", caption: "Phone", type: "tel", autoComplete: "tel", maxLength: 20 },
      { name: "email", caption: "Email", type: "email", autoComplete: "email", maxLength: 120 },
      {
        name: "room_type",
        caption: "Room type",
        tag: "select",
        options: [
          { value: "single", text: "Single" },
          { value: "double", text: "Double" },
          { value: "suite", text: "Suite" },
        ],
      },
      { name: "check_in", caption: "Check-in date", type: "date" },
      { name: "nights", caption: "Number of nights", type: "number", min: 1, max: 60 },
      { name: "requests", caption: "Special requests", tag: "textarea", maxLength: 200, wide: true },
    ],
  },
  {
    // A legacy courier waybill: cryptic captions and names, almost no hints in
    // the markup. This is the form the cloud teacher has to explain.
    id: "C",
    tab: "C · CONSIGNMENT NOTE",
    title: "Consignment note",
    serial: "Nº 0417-C",
    inputs: [
      { name: "cnee_nm", caption: "CNEE", maxLength: 40 },
      { name: "cnee_tel", caption: "CNEE TEL", type: "tel", maxLength: 20 },
      { name: "addr_1", caption: "ADDR 1", maxLength: 60, wide: true },
      { name: "dist_city", caption: "DIST/CITY", maxLength: 40 },
      { name: "st_prov", caption: "ST/PROV", maxLength: 40 },
      { name: "zip", caption: "ZIP", inputMode: "numeric", maxLength: 5 },
      { name: "desc", caption: "DESC", maxLength: 60 },
      { name: "pcs", caption: "PCS", type: "number", min: 1, max: 999 },
      {
        name: "svc",
        caption: "SVC",
        tag: "select",
        options: [
          { value: "STD", text: "STD" },
          { value: "EXP", text: "EXP" },
          { value: "SDD", text: "SDD" },
        ],
      },
      { name: "rmks", caption: "RMKS", maxLength: 80, wide: true },
    ],
  },
];

export const formById = (id: string) => FORMS.find((f) => f.id === id) ?? FORMS[0];
