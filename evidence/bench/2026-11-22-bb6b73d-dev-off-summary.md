# Bench: dev · hints off · 3 repeat(s)

- Date 2026-11-22 · commit bb6b73d · prompt p0c-v3 · gate v2
- Set sha256 f27f406fbf6b0a9bd48cb7d464db2cf6e6b853a0ddcd30d07671c80b9c6d03a7 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB · **contended: sibling Nano Chrome was running**
- No hints

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 87.3 | 86.9 | 88.1 |
| rawAccuracyP0c | 89.69 | 89.29 | 90.48 |
| acceptedWrongPct | 1.59 | 1.19 | 2.38 |
| coverage | 92.89 | 92 | 93.33 |
| usefulCoverage | 91.11 | 89.33 | 92 |
| amberPct | 6.35 | 5.95 | 7.14 |
| warmP50 | 2026 | 1902 | 2097 |
| warmP95 | 2605.67 | 2236 | 3143 |

JSON valid per repeat: 10/10 · 10/10 · 10/10 · on-device batches: 10/10 · 10/10 · 10/10 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r2 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC2 `desc`: shown "wooden tray, regular service" · gold "wooden tray"

Raw rows: `evidence/bench/2026-11-22-bb6b73d-dev-off-r1.json`, `evidence/bench/2026-11-22-bb6b73d-dev-off-r2.json`, `evidence/bench/2026-11-22-bb6b73d-dev-off-r3.json`
