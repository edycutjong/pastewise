# Bench: dev · hints on · 3 repeat(s)

- Date 2026-11-22 · commit c452669 · prompt p0c-v3 · gate v2
- Set sha256 f27f406fbf6b0a9bd48cb7d464db2cf6e6b853a0ddcd30d07671c80b9c6d03a7 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB
- Hints sha256/16 1cbd54847bcc010a

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 86.5 | 85.71 | 86.9 |
| rawAccuracyP0c | 88.89 | 88.1 | 89.29 |
| acceptedWrongPct | 2.78 | 2.38 | 3.57 |
| coverage | 93.33 | 93.33 | 93.33 |
| usefulCoverage | 90.22 | 89.33 | 90.67 |
| amberPct | 5.95 | 5.95 | 5.95 |
| warmP50 | 2176.33 | 2170 | 2184 |
| warmP95 | 2810.67 | 2656 | 3074 |

JSON valid per repeat: 10/10 · 10/10 · 10/10 · on-device batches: 10/10 · 10/10 · 10/10 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 DC1 `desc`: shown "box of batik scarves" · gold "batik scarves"
- r1 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r2 DC1 `desc`: shown "box of batik scarves" · gold "batik scarves"
- r2 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC1 `desc`: shown "box of batik scarves" · gold "batik scarves"
- r3 DC1 `rmks`: shown "same day if possible! ring the bell twice" · gold "ring the bell twice"
- r3 DC2 `desc`: shown "wooden tray, regular service. Fragile, keep upright" · gold "wooden tray"

Raw rows: `evidence/bench/2026-11-22-c452669-dev-hints-r1.json`, `evidence/bench/2026-11-22-c452669-dev-hints-r2.json`, `evidence/bench/2026-11-22-c452669-dev-hints-r3.json`
