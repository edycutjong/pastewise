# Bench: holdout · hints off · 3 repeat(s)

- Date 2026-11-22 · commit f00f35d · prompt p0c-v3 · gate v4
- Set sha256 570778671fa2ce0fc1c6837a8ad7feed65d8a4b614c25a892bc890dd8715a35e (45 pastes) · today fixed at 2026-11-22
- Path: the real app page, ONLY_ON_DEVICE via Firebase AI Logic, Chrome 157.0.0.0, Apple M1 Max 32 GB
- No hints

| Metric | mean | min | max |
|---|---|---|---|
| rawAccuracyStrict | 80.69 | 80.26 | 81.54 |
| rawAccuracyP0c | 81.62 | 81.28 | 82.31 |
| acceptedWrongPct | 5.9 | 5.13 | 6.41 |
| coverage | 83.33 | 83.23 | 83.53 |
| usefulCoverage | 77.94 | 77.54 | 78.14 |
| amberPct | 17.69 | 17.44 | 17.95 |
| warmP50 | 2342.33 | 2334 | 2358 |
| warmP95 | 2942.67 | 2889 | 2986 |

JSON valid per repeat: 45/45 · 45/45 · 45/45 · on-device batches: 45/45 · 45/45 · 45/45 · stalls: 0 · 0 · 0

## Accepted-wrong rows (the dangerous ones)
- r1 H04-A `street`: shown "Jl. Anggrek 6 Rt.2 Rw.7 Bekasi" · gold "Jl. Anggrek 6 Rt.2 Rw.7"
- r1 H04-C `addr_1`: shown "Jl. Anggrek 6 Rt.2 Rw.7 Bekasi" · gold "Jl. Anggrek 6 Rt.2 Rw.7"
- r1 H05-A `notes`: shown "deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r1 H05-C `rmks`: shown "Please deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r1 H06-A `notes`: shown "Doorbell broken, call on arrival" · gold "Same day please. Doorbell broken, call on arrival."
- r1 H07-A `item`: shown "a pair of blue rubber sandals" · gold "pair of blue rubber sandals"
- r1 H07-A `notes`: shown "just leave it with the security guard at the lobby. Thank you so much, you're the best" · gold "leave it with the security guard at the lobby"
- r1 H07-C `desc`: shown "a pair of blue rubber sandals as a housewarming gift" · gold "pair of blue rubber sandals"
- r1 H08-A `notes`: shown "leave it with the security guard" · gold "If nobody's home, leave it with the security guard"
- r1 H09-C `rmks`: shown "ADMIN" · gold ""
- r1 H10-A `notes`: shown "use bubble wrap" · gold "please use bubble wrap"
- r1 H11-A `item`: shown "wooden chopsticks" · gold "sets of wooden chopsticks"
- r1 H12-C `rmks`: shown "Order #A-2291 :: 1 purple yoga mat :: for Cindy Lauw :: Jl. Pasteur 120, Bandung" · gold ""
- r1 H15-A `notes`: shown "If the courier comes while he's at the mosque, his wife can sign for it. Also please remind me to bring the old invoice" · gold "If the courier comes while he's at the mosque, his wife can sign for it"
- r1 HB01 `requests`: shown "we'll be arriving late, around 11pm" · gold "arriving late, around 11pm"
- r1 HB02 `requests`: shown "prepare a cake and flowers" · gold "Please prepare a cake and flowers"
- r1 HB05 `room_type`: shown "suite" · gold "single"
- r1 HB08 `requests`: shown "arrive earlier, on 17 December" · gold ""
- r1 HB12 `guest_name`: shown "VIP" · gold "Wirawan Hartanto"
- r1 HB14 `requests`: shown "We'd like to be near the pool for the New Year's Eve fireworks on 31 Dec" · gold "near the pool for the New Year's Eve fireworks"
- r2 H02-C `rmks`: shown "Express if you can" · gold ""
- r2 H04-A `street`: shown "Jl. Anggrek 6 Rt.2 Rw.7 Bekasi" · gold "Jl. Anggrek 6 Rt.2 Rw.7"
- r2 H04-C `addr_1`: shown "Jl. Anggrek 6 Rt.2 Rw.7 Bekasi" · gold "Jl. Anggrek 6 Rt.2 Rw.7"
- r2 H05-A `notes`: shown "deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r2 H05-C `rmks`: shown "Please deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r2 H06-A `notes`: shown "Doorbell broken, call on arrival" · gold "Same day please. Doorbell broken, call on arrival."
- r2 H07-A `item`: shown "blue rubber sandals" · gold "pair of blue rubber sandals"
- r2 H07-A `notes`: shown "just leave it with the security guard at the lobby" · gold "leave it with the security guard at the lobby"
- r2 H07-C `desc`: shown "a pair of blue rubber sandals as a housewarming gift" · gold "pair of blue rubber sandals"
- r2 H07-C `rmks`: shown "Please just leave it with the security guard at the lobby" · gold "leave it with the security guard at the lobby"
- r2 H08-A `notes`: shown "leave it with the security guard" · gold "If nobody's home, leave it with the security guard"
- r2 H09-C `dist_city`: shown "Jakarta" · gold "Jakarta Barat"
- r2 H09-C `st_prov`: shown "Barat" · gold ""
- r2 H09-C `rmks`: shown "ADMIN" · gold ""
- r2 H10-A `notes`: shown "use bubble wrap" · gold "please use bubble wrap"
- r2 H12-C `rmks`: shown "either works" · gold ""
- r2 H15-A `notes`: shown "If the courier comes while he's at the mosque, his wife can sign for it. Also please remind me to bring the old invoice" · gold "If the courier comes while he's at the mosque, his wife can sign for it"
- r2 HB01 `requests`: shown "we'll be arriving late, around 11pm" · gold "arriving late, around 11pm"
- r2 HB02 `requests`: shown "prepare a cake and flowers" · gold "Please prepare a cake and flowers"
- r2 HB04 `email`: shown "rsv@example.com" · gold ""
- r2 HB05 `room_type`: shown "suite" · gold "single"
- r2 HB08 `requests`: shown "arrive earlier, on 17 December" · gold ""
- r2 HB12 `guest_name`: shown "VIP" · gold "Wirawan Hartanto"
- r2 HB14 `requests`: shown "We'd like to be near the pool for the New Year's Eve fireworks on 31 Dec" · gold "near the pool for the New Year's Eve fireworks"
- r3 H02-C `rmks`: shown "call her cell 0822 5550 7714 instead" · gold ""
- r3 H03-C `addr_1`: shown "ADMIN" · gold "Jl. Cendana 33"
- r3 H03-C `dist_city`: shown "ADMIN" · gold "Denpasar"
- r3 H03-C `st_prov`: shown "ADMIN" · gold "Bali"
- r3 H03-C `zip`: shown "ADMIN" · gold "80114"
- r3 H03-C `desc`: shown "ADMIN" · gold "bottles of coconut oil"
- r3 H05-A `notes`: shown "deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r3 H05-C `rmks`: shown "Please deliver in the afternoon, she naps in the morning" · gold "Please deliver in the afternoon"
- r3 H06-A `notes`: shown "Doorbell broken, call on arrival" · gold "Same day please. Doorbell broken, call on arrival."
- r3 H07-A `item`: shown "blue rubber sandals" · gold "pair of blue rubber sandals"
- r3 H07-A `notes`: shown "just leave it with the security guard at the lobby" · gold "leave it with the security guard at the lobby"
- r3 H07-C `desc`: shown "a pair of blue rubber sandals" · gold "pair of blue rubber sandals"
- r3 H07-C `rmks`: shown "Please just leave it with the security guard at the lobby" · gold "leave it with the security guard at the lobby"
- r3 H09-C `rmks`: shown "ADMIN" · gold ""
- r3 H10-A `notes`: shown "use bubble wrap" · gold "please use bubble wrap"
- r3 H12-C `rmks`: shown "Order #A-2291" · gold ""
- r3 H14-C `rmks`: shown "Thx" · gold ""
- r3 H15-A `notes`: shown "If the courier comes while he's at the mosque, his wife can sign for it. Also please remind me to bring the old invoice" · gold "If the courier comes while he's at the mosque, his wife can sign for it"
- r3 HB01 `requests`: shown "we'll be arriving late, around 11pm" · gold "arriving late, around 11pm"
- r3 HB02 `requests`: shown "prepare a cake and flowers" · gold "Please prepare a cake and flowers"
- r3 HB04 `email`: shown "rsv@example.com" · gold ""
- r3 HB05 `room_type`: shown "suite" · gold "single"
- r3 HB08 `requests`: shown "arrive earlier, on 17 December" · gold ""
- r3 HB12 `guest_name`: shown "VIP" · gold "Wirawan Hartanto"
- r3 HB14 `requests`: shown "We'd like to be near the pool for the New Year's Eve fireworks on 31 Dec" · gold "near the pool for the New Year's Eve fireworks"

Raw rows: `evidence/bench/2026-11-22-f00f35d-holdout-off-r1.json`, `evidence/bench/2026-11-22-f00f35d-holdout-off-r2.json`, `evidence/bench/2026-11-22-f00f35d-holdout-off-r3.json`
Aggregate: `evidence/bench/aggregates/2026-11-22-f00f35d-holdout-off.json`
