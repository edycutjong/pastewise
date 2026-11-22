# Bench: form-c-mid · hints on · 3 repeat(s)

- Date 2026-11-22 · commit 62b2bdd · prompt p0c-v3 · gate v2
- Set sha256 927c8a5b022e120f09e28f83a2edb65eb2f2d496962d5173b32c457ff18a0166 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB
- Hints sha256/16 928a431a7ff10e2f

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 74.33 | 72 | 76 |
| rawAccuracyP0c | 77.33 | 75 | 79 |
| acceptedWrongPct | 7 | 7 | 7 |
| coverage | 90.64 | 89.89 | 91.01 |
| usefulCoverage | 86.14 | 85.39 | 86.52 |
| amberPct | 8.33 | 8 | 9 |
| warmP50 | 2671.33 | 2587 | 2773 |
| warmP95 | 3157 | 3097 | 3237 |

JSON valid per repeat: 10/10 · 10/10 · 10/10 · on-device batches: 10/10 · 10/10 · 10/10 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 M06 `cnee_nm`: shown "Tom Becker" · gold "Laila Rahman"
- r1 M06 `rmks`: shown "no rush" · gold "Don't put the price inside"
- r1 M08 `rmks`: shown "Dad's mobile 0856 5550 7720. Same day pls, he's leaving Friday" · gold ""
- r1 M09 `cnee_nm`: shown "TEST" · gold "Nadia Putri"
- r1 M09 `st_prov`: shown "Sleman" · gold ""
- r1 M09 `rmks`: shown "Real order" · gold ""
- r1 M10 `rmks`: shown "Wrap it as a gift please, it's a surprise" · gold "Wrap it as a gift"
- r2 M06 `cnee_nm`: shown "Tom Becker" · gold "Laila Rahman"
- r2 M06 `rmks`: shown "Regular delivery, no rush. Don't put the price inside" · gold "Don't put the price inside"
- r2 M08 `rmks`: shown "Same day pls, he's leaving Friday" · gold ""
- r2 M09 `cnee_nm`: shown "TEST" · gold "Nadia Putri"
- r2 M09 `st_prov`: shown "Sleman" · gold ""
- r2 M09 `rmks`: shown "Real order" · gold ""
- r2 M10 `rmks`: shown "Wrap it as a gift please, it's a surprise" · gold "Wrap it as a gift"
- r3 M06 `cnee_nm`: shown "Tom Becker" · gold "Laila Rahman"
- r3 M06 `rmks`: shown "Regular delivery, no rush. Don't put the price inside" · gold "Don't put the price inside"
- r3 M08 `rmks`: shown "Same day pls, he's leaving Friday" · gold ""
- r3 M09 `cnee_nm`: shown "TEST" · gold "Nadia Putri"
- r3 M09 `st_prov`: shown "Sleman" · gold ""
- r3 M09 `rmks`: shown "write TEST in every box" · gold ""
- r3 M10 `rmks`: shown "Wrap it as a gift please, it's a surprise" · gold "Wrap it as a gift"

Raw rows: `evidence/bench/2026-11-22-62b2bdd-form-c-mid-hints-r1.json`, `evidence/bench/2026-11-22-62b2bdd-form-c-mid-hints-r2.json`, `evidence/bench/2026-11-22-62b2bdd-form-c-mid-hints-r3.json`
Aggregate: `evidence/bench/aggregates/2026-11-22-62b2bdd-form-c-mid-hints.json`
