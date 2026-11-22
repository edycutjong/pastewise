# Pastewise

Copy a messy order message, press one shortcut, and the form's fields fill on your laptop.

- **On device:** Gemini Nano through Firebase AI Logic (`InferenceMode.ONLY_ON_DEVICE`), with a JSON schema built from the form passed as
  `onDeviceParams.promptOptions.responseConstraint`. Customer text has no cloud route.
- **In the cloud:** a "form teacher" (`InferenceMode.ONLY_IN_CLOUD`, `responseSchema`) reads only the **empty** form (labels, names,
  options) and explains cryptic boxes.
- **Code decides:** a value is kept only if it appears in your text and passes the field's format check; otherwise the box stays amber.
- Every fill shows its `inferenceSource`. App Check (reCAPTCHA Enterprise) protects every AI Logic call; Remote Config holds the limits.

> Status: in development for #BuildHybridAI. This README will be replaced with the full write-up.

## Run locally

```bash
cp .env.example .env.local   # fill in the Firebase web config
npm install
npm run build                # static export to out/
npm test                     # unit tests (Vitest)
npm run e2e                  # browser tests (Playwright, installed Chrome)
```

The SDK spike (`/spike/`, driven by `scripts/spike/run.mjs`) needs Chrome with the built-in AI model available and a registered App Check
debug token passed as `PW_APPCHECK_DEBUG_TOKEN` (it is injected at page load and never bundled). Its network log is in
`evidence/spike/spike-summary.json`.

## License

Apache-2.0
