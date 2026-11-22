<p align="center">
  <img src="docs/assets/readme-hero-animated.svg" alt="Pastewise — fills the form from your paste, on your laptop. Boxes press through in carbon blue; one phone number stays amber. Text from your paste sent to the cloud: 0 bytes found." width="100%">
</p>

# Pastewise

Copy a messy order message, press one shortcut, and the form's fields fill on your laptop.

What exists today is the SDK spike (`/spike/`), which proves the Firebase calls the app is built on:

- **On device:** Gemini Nano through Firebase AI Logic (`InferenceMode.ONLY_ON_DEVICE`, no cloud parameters at all), with a JSON schema
  built from the form passed as `onDeviceParams.promptOptions.responseConstraint`.
- **In the cloud:** a "form teacher" (`InferenceMode.ONLY_IN_CLOUD`, `responseSchema`) that is sent only the **empty** form (labels, names,
  options) and explains cryptic boxes.
- **No on-device model:** a consent path (`InferenceMode.PREFER_ON_DEVICE`) that may send that one message to the cloud, and is meant to run
  only after the person agrees.
- Each response reports its `inferenceSource`; App Check (reCAPTCHA Enterprise) protects every AI Logic call; Remote Config holds the limits.

Planned (not built yet): the fill screen, the code check that keeps a value only if it appears in your text and passes the field's format
check (otherwise the box stays amber), and the network receipt.

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
`evidence/spike/spike-local.json` (localhost, debug token) and `evidence/spike/spike-hosted.json` (deployed build, reCAPTCHA Enterprise).

## License

Apache-2.0
