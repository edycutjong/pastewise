// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

// "Sent with your Yes" is derived from the request records: a request counts when its body carries the consented message,
// whenever it lands (a late request after the run returned still counts); a request without the message never counts.
const sent: string[] = [];
window.fetch = (async (input: RequestInfo | URL) => {
  sent.push(String(input));
  return new Response("{}");
}) as typeof fetch;
const { installLedger, ledger, markConsentRun, trackRun } = await import("@/ledger/egress");
installLedger();

const MSG = "Order: 1 ceramic mug set for Budi Santoso, 0812 5550 7734, Jl. Diponegoro 88, Semarang, Jawa Tengah 50241.";
const BYTES = new TextEncoder().encode(MSG).length;
const AI = "https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent";
const body = (text: string) => JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }] });

describe("consent total, attributed by content", () => {
  it("the same message tracked twice (stalled on-device run, then the consent run): the request belongs to the newer run", async () => {
    trackRun("on-device-run", MSG, []);
    trackRun("consent-run", MSG, []);
    markConsentRun("consent-run", MSG);
    expect(ledger.consentBytes()).toBe(0); // nothing has left yet
    await window.fetch(AI, { method: "POST", body: body(`Fill the form from this message:\n${MSG}`) });
    expect(ledger.records().at(-1)?.runId).toBe("consent-run");
    expect(ledger.consentBytes()).toBe(BYTES);
  });
  it("an empty-form teacher request in the same window adds nothing", async () => {
    await window.fetch(AI, { method: "POST", body: body('You explain the boxes of an EMPTY web form. {"title":"Consignment note"}') });
    expect(ledger.consentBytes()).toBe(BYTES);
  });
  it("a late request carrying the message (a timed-out attempt that left after the run returned) still counts", async () => {
    const v = ledger.version();
    await window.fetch(AI, { method: "POST", body: body(MSG) });
    expect(ledger.consentBytes()).toBe(2 * BYTES);
    expect(ledger.version()).not.toBe(v);
  });
  it("a short consented message with no matchable tokens still counts; a request sharing one word with it does not", async () => {
    const SHORT = "Ali 3 pcs";
    trackRun("short-run", SHORT, []);
    markConsentRun("short-run", SHORT);
    const before = ledger.consentBytes();
    await window.fetch(AI, { method: "POST", body: body(`Fill the form from this message:\n${SHORT}`) });
    expect(ledger.consentBytes()).toBe(before + new TextEncoder().encode(SHORT).length);
    await window.fetch(AI, { method: "POST", body: body("Ali asked about the Semarang depot") });
    expect(ledger.consentBytes()).toBe(before + new TextEncoder().encode(SHORT).length);
  });
  it("a non-AI request carrying the message is not counted as sent with your Yes (it shows in the paste-bytes counter instead)", async () => {
    const before = ledger.consentBytes();
    await window.fetch("/__egress_canary?m=" + encodeURIComponent(MSG));
    expect(ledger.consentBytes()).toBe(before);
    expect(ledger.records().at(-1)?.pasteBytesFound).toBeGreaterThan(0);
    expect(sent.length).toBe(6);
  });
});
