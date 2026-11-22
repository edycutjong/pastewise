# Bench: form-c-mid · hints off · 3 repeat(s)

- Date 2026-11-22 · commit 62b2bdd · prompt p0c-v3 · gate v2
- Set sha256 927c8a5b022e120f09e28f83a2edb65eb2f2d496962d5173b32c457ff18a0166 (10 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB · **contended: sibling Nano Chrome was running**
- No hints

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 48.67 | 33 | 73 |
| rawAccuracyP0c | 48.67 | 33 | 73 |
| acceptedWrongPct | 5.67 | 1 | 9 |
| coverage | 54.31 | 28.09 | 89.89 |
| usefulCoverage | 49.44 | 26.97 | 82.02 |
| amberPct | 45.33 | 10 | 72 |
| warmP50 | 14230.67 | 2689 | 20002 |
| warmP95 | 14257.33 | 2766 | 20003 |

JSON valid per repeat: 10/10 · 3/10 · 5/10 · on-device batches: 10/10 · 3/10 · 5/10 · stalls: 0 · 7 · 5

## Accepted-wrong rows (the dangerous ones)
- r1 M02 `rmks`: shown "please call on arrival" · gold "call on arrival"
- r1 M04 `desc`: shown "Deliver to the front desk on floor 12" · gold "notebooks"
- r1 M06 `cnee_nm`: shown "Tom Becker" · gold "Laila Rahman"
- r1 M06 `rmks`: shown "Regular delivery, no rush. Don't put the price inside" · gold "Don't put the price inside"
- r1 M07 `rmks`: shown "leave at the front door if nobody home 😊 thanks" · gold "leave at the front door if nobody home"
- r1 M08 `rmks`: shown "Same day pls, he's leaving Friday" · gold ""
- r1 M09 `cnee_nm`: shown "TEST" · gold "Nadia Putri"
- r1 M09 `st_prov`: shown "Sleman" · gold ""
- r1 M10 `rmks`: shown "Wrap it as a gift please, it's a surprise" · gold "Wrap it as a gift"
- r2 M02 `rmks`: shown "standard is fine. please call on arrival" · gold "call on arrival"
- r3 M06 `cnee_nm`: shown "Tom Becker" · gold "Laila Rahman"
- r3 M06 `rmks`: shown "Regular delivery, no rush. Don't put the price inside" · gold "Don't put the price inside"
- r3 M07 `rmks`: shown "leave at the front door if nobody home 😊 thanks" · gold "leave at the front door if nobody home"
- r3 M08 `rmks`: shown "Same day pls, he's leaving Friday" · gold ""
- r3 M09 `cnee_nm`: shown "TEST" · gold "Nadia Putri"
- r3 M09 `st_prov`: shown "Sleman" · gold ""
- r3 M10 `rmks`: shown "Wrap it as a gift please, it's a surprise" · gold "Wrap it as a gift"

Raw rows: `evidence/bench/2026-11-22-62b2bdd-form-c-mid-off-r1.json`, `evidence/bench/2026-11-22-62b2bdd-form-c-mid-off-r2.json`, `evidence/bench/2026-11-22-62b2bdd-form-c-mid-off-r3.json`
Aggregate: `evidence/bench/aggregates/2026-11-22-62b2bdd-form-c-mid-off.json`
