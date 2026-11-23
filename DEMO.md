# Pastewise: demo and reproduce guide

All data is synthetic (invented names, phone numbers in the 5550 block). Numbers are from committed runs in [`evidence/`](evidence), measured on
one Apple M1 Max (32 GB) with Chrome 157, 2026-11-22.

## 1. Try it in 60 seconds (no setup)

Open <https://pastewise.edycu.dev> in Chrome on a desktop.

| Step | What you should see |
|---|---|
| Under the paste box, click the sample **Gift order with two phone numbers** (message **S1**, [`fixtures/demo/S1.json`](fixtures/demo/S1.json); the click also switches to form **C · CONSIGNMENT NOTE**), then press **Fill this message**. Pasting S1 by hand? Pick tab C first | Boxes fill in carbon blue; each value's source words are underlined in the message |
| Look at the **CNEE TEL** box | It stays **amber**: the message holds two phone numbers (an old dead one and a new one), and the code refuses to guess. Click the number you want under the box to pick it |
| Look at the badge on the fill | `ON_DEVICE` on a Chrome with Gemini Nano. This is the `inferenceSource` Firebase AI Logic reports |
| With Nano: DevTools → Network → **Offline**, then fill another sample | Still `ON_DEVICE`, and the counter still reads 0 bytes: the fill never needed the network ([`evidence/offline/2026-11-23-offline-fill.json`](evidence/offline/2026-11-23-offline-fill.json)) |
| Press **Copy for a spreadsheet** | A header row and a values row go to the clipboard, tab-separated; the status line names any box still amber, copied as it stands |
| Open [`/receipt/`](https://pastewise.edycu.dev/receipt/) | The recorded network log behind the "0 bytes" counter |
| Open [`/bench/`](https://pastewise.edycu.dev/bench/) | The measured numbers below, with hints off and on |
| Optional: press **Teach this form** | The cloud "form teacher" gets only the empty form; the drawer shows the exact payload first. A form with a builder-seeded saved copy already uses it, labelled "saved copy"; **Ask again with this empty form** (**Send this empty form** when there is no copy) makes a fresh cloud call whose `IN_CLOUD` source it prints. If that call fails, the saved copy is shown with the reason |

**No Nano on your browser?** A plain notice appears; the sheet shows the exact message that would leave, its byte count, and **Watch a recorded run** (a real
on-device fill). Nothing is sent until you press **Send this one**; that one paste then goes through
`PREFER_ON_DEVICE` to the cloud, and the screen shows the bytes sent. In one recorded S1 run the first attempt timed out and was retried, so it showed 682 bytes (2 × the 341-byte message), matching the 2 requests Chrome's wire log recorded carrying it ([`evidence/consent-path-2026-11-22.json`](evidence/consent-path-2026-11-22.json)).

## 2. What was measured

Through the real page, `ONLY_ON_DEVICE`, 3 repeats per row, prompt `p0c-v3`, Apple M1 Max 32 GB, Chrome 157, 2026-11-22.

**Held-out set (45 message-form pairs, SHA-256 `57077867…`), run once on the release gate v4, commit `f00f35d`:**

| Hints | Strict field accuracy | Wrong value shown (all boxes) | …name/phone/address/postal only | Warm p50 / p95 | JSON valid |
|---|---|---|---|---|---|
| off | 80.7% (80.3–81.5) | 5.9% (5.1–6.4) | 2.0% | 2.34 s / 2.94 s | 45/45 ×3 |
| on (frozen cloud hints) | 81.5% (80.0–82.6) | 5.3% (5.1–5.4) | 1.3% | 2.40 s / 2.93 s | 45/45 ×3 |

The bars we aimed for (strict ≥ 90%, wrong shown ≤ 3%, warm p50 ≤ 2 s) were all missed. Free-text boxes (notes, remarks, requests) account for most
of the wrong-shown figure; see the README for the split.

**180-pair bench (60 orders on forms A and C, 60 bookings on form B), gate v3, commits `c5e56c5` (off) and `b939206` (on; same `src/`):** hints off strict 80.6%,
wrong shown 7.7% (2.9% in name/phone/address/postal boxes), p50 2.32 s; hints on 80.5%, 7.5%, 2.6%. Teacher delta on form C strict: 78.28% → 78.39%.
The release response that followed (gate v4: recipient names always amber) is described in the README.

Source files: `evidence/bench/aggregates/2026-11-22-{c5e56c5,b939206,f00f35d}-*.json` and the raw rows `evidence/bench/2026-11-22-*-r{1,2,3}.json`; per-form
tables in `evidence/bench/report-*.json` (`node scripts/bench_report.mjs --set holdout`). Earlier midpoint rows (continuity-20 on gate v2, form-c-mid) are on
[/bench](https://pastewise.edycu.dev/bench/) and are not mixed into the figures above; continuity-20 is a frozen set kept out of the repo (SHA-256 `8b019d42…e997f0`).

Network capture of the hosted page (5 synthetic messages: 4 fills, all on-device, plus 1 over-long paste refused): 0 paste-word hits, 0 requests during the on-device fills, canary caught:
[`evidence/network/2026-11-22-4b8f0b5-live.json`](evidence/network/2026-11-22-4b8f0b5-live.json).

## 3. Reproduce

Needs Chrome desktop with Gemini Nano downloaded, a Firebase web config, and an App Check debug token for localhost.

```bash
git clone https://github.com/edycutjong/pastewise.git && cd pastewise
cp .env.example .env.local        # Firebase web config
npm install && npm test           # 128 unit tests
npm run build                     # static export to out/
node scripts/bench.mjs --set sets/holdout.json --repeats 3 --hints off          # refuses a second held-out run per prompt/gate/arm
node scripts/bench.mjs --set sets/bench.json --repeats 3 --hints cloud          # calls the real cloud teacher once per form
node scripts/bench_report.mjs --set holdout                                       # per-form and per-field tables from the raw rows
node scripts/egress_check.mjs     # add --base https://pastewise.edycu.dev for the hosted page
```

The bench opens a headed Chrome, uses the real Fill button and scores the app's own gate output; it writes raw rows and a summary into
`evidence/bench/`. The scripts live in [`scripts/`](scripts).

## 4. What this does not show

- It is a hosted web app, not a Chrome extension: it does not fill forms on other sites.
- The held-out set is 45 pairs: its ranges are wide. Among the name/phone/address/postal boxes, two were above 5% wrong-shown with hints off (guest name on B, ADDR 1 on C, 6.7% each) and one with hints on (STREET on A).
- Form C still shows wrong values 4.7–5.8% of the time on the held-out set; see "Honest limits" in the [README](README.md).
