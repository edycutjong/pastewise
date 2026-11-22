# Bench: dev · hints off · 3 repeat(s)

- Date 2026-11-22 · commit c67d663 · prompt p0c-v3 · gate v2
- Set sha256 f27f406fbf6b0a9bd48cb7d464db2cf6e6b853a0ddcd30d07671c80b9c6d03a7 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB
- No hints

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 86.5 | 85.71 | 86.9 |
| rawAccuracyP0c | 88.89 | 88.1 | 89.29 |
| acceptedWrongPct | 1.19 | 1.19 | 1.19 |
| coverage | 92 | 92 | 92 |
| usefulCoverage | 90.67 | 90.67 | 90.67 |
| amberPct | 7.14 | 7.14 | 7.14 |
| warmP50 | 2512.67 | 2479 | 2551 |
| warmP95 | 3169.33 | 3084 | 3331 |

JSON valid per repeat: 10/10 · 10/10 · 10/10 · on-device batches: 10/10 · 10/10 · 10/10 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r2 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"

Raw rows: `evidence/bench/2026-11-22-c67d663-dev-off-r1.json`, `evidence/bench/2026-11-22-c67d663-dev-off-r2.json`, `evidence/bench/2026-11-22-c67d663-dev-off-r3.json`
