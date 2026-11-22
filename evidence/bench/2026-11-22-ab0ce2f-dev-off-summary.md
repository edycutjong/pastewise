# Bench: dev · hints off · 3 repeat(s)

- Date 2026-11-22 · commit ab0ce2f · prompt p0c-v3 · gate v2
- Set sha256 f27f406fbf6b0a9bd48cb7d464db2cf6e6b853a0ddcd30d07671c80b9c6d03a7 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB
- No hints

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 87.3 | 85.71 | 88.1 |
| rawAccuracyP0c | 89.69 | 88.1 | 90.48 |
| acceptedWrongPct | 1.59 | 1.19 | 2.38 |
| coverage | 92.89 | 92 | 93.33 |
| usefulCoverage | 91.11 | 89.33 | 92 |
| amberPct | 5.95 | 4.76 | 7.14 |
| warmP50 | 2209.67 | 1990 | 2392 |
| warmP95 | 2892 | 2421 | 3151 |

JSON valid per repeat: 10/10 · 10/10 · 10/10 · on-device batches: 10/10 · 10/10 · 10/10 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r1 DC2 `rmks`: shown "regular service" · gold "Fragile, keep upright"
- r2 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"

Raw rows: `evidence/bench/2026-11-22-ab0ce2f-dev-off-r1.json`, `evidence/bench/2026-11-22-ab0ce2f-dev-off-r2.json`, `evidence/bench/2026-11-22-ab0ce2f-dev-off-r3.json`
