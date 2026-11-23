# App Check enforcement on the live AI Logic endpoint

- date: 2026-11-24 00:29 WIB
- repo HEAD: 5b35b82
- command: npx playwright test -c playwright.live.config.ts -g "App Check is enforced" --reporter=list
- what it does (tests/live/live.spec.ts:56): POST generateContent to firebasevertexai.googleapis.com for project pastewise-hybrid-ai with the public web API key and NO App Check token; expects HTTP 401 whose message names App Check; control: the same call without the key fails for a different reason.

```

Running 1 test using 1 worker

  ✓  1 tests/live/live.spec.ts:56:1 › live: App Check is enforced, a request with the public API key but no App Check token is rejected for that reason (842ms)

  1 passed (1.3s)
```
