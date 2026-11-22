// The egress ledger's counting rule, including what it does NOT catch
// (documented blind spots, eval-plan "Egress").
import { describe, expect, it } from "vitest";
import { pasteTokens, tokensFound } from "@/ledger/tokens";

const S3 = "Order: 1 ceramic mug set for Budi Santoso, 0812 5550 7734, Jl. Diponegoro 88, Semarang, Jawa Tengah 50241. Gift wrap please.";
const VOCAB = ["Shipping / order form", "name", "Recipient name", "phone", "Phone", "street", "Street address", "item", "Item", "notes", "Delivery notes"];

describe("pasteTokens", () => {
  const t = pasteTokens(S3, VOCAB);
  it("keeps names, places, digit runs and the joined phone number", () => {
    for (const w of ["budi", "santoso", "semarang", "diponegoro", "50241", "0812", "5550", "7734", "081255507734", "ceramic"]) expect(t).toContain(w);
  });
  it("drops short words, stop words and the form's own vocabulary", () => {
    for (const w of ["mug", "set", "jl", "88", "order", "please", "item"]) expect(t).not.toContain(w);
  });
});

describe("tokensFound", () => {
  const t = pasteTokens(S3, VOCAB);
  it("an empty-form teacher payload has 0 paste bytes", () => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: `Form: Shipping / order form\n${VOCAB.join("\n")}` }] }] });
    expect(tokensFound(body, t)).toEqual({ hits: [], bytes: 0 });
  });
  it("a body carrying the paste is caught, in raw, URL-encoded and JSON-escaped form", () => {
    expect(tokensFound(JSON.stringify({ text: S3 }), t).bytes).toBeGreaterThan(40);
    expect(tokensFound(`q=${encodeURIComponent(S3)}`, t).hits).toContain("santoso");
    expect(tokensFound('{"t":"Budi \\u0053antoso"}', t).hits).toContain("santoso");
  });
  it("a phone number survives any separator", () => {
    expect(tokensFound("tel=0812-5550-7734", t).hits).toContain("081255507734");
    expect(tokensFound("tel=081255507734", t).hits).toContain("081255507734");
  });
  it("bytes are the UTF-8 length of distinct tokens found", () => {
    expect(tokensFound("budi budi santoso", t)).toEqual({ hits: ["budi", "santoso"], bytes: 11 });
  });
  it("blind spots: a 3-letter name and base64 text are NOT caught (stated on the receipt)", () => {
    const short = pasteTokens("for Ali, 3 mugs", []);
    expect(short).not.toContain("ali");
    expect(tokensFound(btoa("Budi Santoso"), t).bytes).toBe(0);
  });
  it("whole-word only: 'budiman' is not 'budi'", () => {
    expect(tokensFound("budiman", t).bytes).toBe(0);
  });
});
