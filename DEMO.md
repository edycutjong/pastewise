# Pastewise: demo and reproduce guide

All data is synthetic (invented names, phone numbers in the 5550 block). Numbers are from committed runs in [`evidence/`](evidence), measured on
one Apple M1 Max (32 GB) with Chrome 157, 2026-11-22.

## 1. Try it in 60 seconds (no setup)

Open <https://pastewise.edycu.dev> in Chrome on a desktop.

| Step | What you should see |
|---|---|
| Paste the synthetic message **S1** (from [`fixtures/demo/S1.json`](fixtures/demo/S1.json), field `paste`) and press **Fill this message** | Boxes fill in carbon blue; each value's source words are underlined in the message |
| Look at the **CNEE TEL** box | It stays **amber**: the message holds two phone numbers (an old dead one and a new one), and the code refuses to guess |
| Look at the badge on the fill | `ON_DEVICE` on a Chrome with Gemini Nano. This is the `inferenceSource` Firebase AI Logic reports |
| Open the **Teach** drawer | The cloud "form teacher" gets only the empty form; the drawer shows the exact payload, and after a fresh cloud call its `IN_CLOUD` source (otherwise it says it is showing a saved copy) |
| Open [`/receipt/`](https://pastewise.edycu.dev/receipt/) | The recorded network log behind the "0 bytes" counter |
| Open [`/bench/`](https://pastewise.edycu.dev/bench/) | The measured numbers below, with hints off and on |

**No Nano on your browser?** A plain notice appears. Nothing is sent until you press **Yes**; that one paste then goes through
`PREFER_ON_DEVICE` to the cloud, and the screen shows the bytes sent (in one recorded S1 run the first attempt timed out and was retried, so it showed 2 × 341 bytes, equal to Chrome's wire log in
[`evidence/consent-path-2026-11-22.json`](evidence/consent-path-2026-11-22.json)).

## 2. What was measured

Through the real page, `ONLY_ON_DEVICE`, 3 repeats, prompt `p0c-v3`, code gate v2, commit `62b2bdd`.

| Set | Hints | Strict field accuracy | Wrong value shown | Warm p50 |
|---|---|---|---|---|
| continuity-20 (20 messages, forms A and B) | off | 92.5% | 1.88% | 2.24 s |
| continuity-20 | on | 92.7% | 1.46% | 2.23 s |
| form C (10 harder messages) | off | 74.0% | 10.33% | 2.62 s |
| form C | on | 74.3% | 7.00% | 2.67 s |

continuity-20 is a frozen held-out set kept out of the repo (SHA-256 `8b019d42…f997f0`, recorded in every run file), so it cannot be re-run from a clone; `sets/form-c-mid.json` and `sets/dev.json` can.

Source files: `evidence/bench/aggregates/2026-11-22-62b2bdd-*.json` and the `*-summary.md` files beside the raw `r1`–`r3` rows.
Network capture of the hosted page (5 synthetic messages: 4 fills, all on-device, plus 1 over-long paste refused): 0 paste-word hits, 0 requests during the on-device fills, canary caught:
[`evidence/network/2026-11-22-94854aa-live.json`](evidence/network/2026-11-22-94854aa-live.json).

## 3. Reproduce

Needs Chrome desktop with Gemini Nano downloaded, a Firebase web config, and an App Check debug token for localhost.

```bash
git clone https://github.com/edycutjong/pastewise.git && cd pastewise
cp .env.example .env.local        # Firebase web config
npm install && npm test           # 115 unit tests
npm run build                     # static export to out/
node scripts/bench.mjs --set sets/form-c-mid.json --repeats 3 --hints off
node scripts/bench.mjs --set sets/form-c-mid.json --repeats 3 --hints cloud
node scripts/egress_check.mjs     # add --base https://pastewise.edycu.dev for the hosted page
```

The bench opens a headed Chrome, uses the real Fill button and scores the app's own gate output; it writes raw rows and a summary into
`evidence/bench/`. The scripts live in [`scripts/`](scripts).

## 4. What this does not show

- It is a hosted web app, not a Chrome extension: it does not fill forms on other sites.
- The bench has not been re-run on the current gate version (v3).
- Form C still shows wrong values 7% of the time; see "Honest limits" in the [README](README.md).
