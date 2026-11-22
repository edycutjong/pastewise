# Contributing to Pastewise

Thanks for looking. Pastewise is a hackathon project with a hard privacy claim ("customer data sent to the cloud: 0 bytes"), so changes are judged against that claim first.

## Getting started

```bash
npm ci
cp .env.example .env.local   # fill in your own Firebase web config
npm run dev                  # http://localhost:3102
```

On-device fills need desktop Chrome with Gemini Nano (the Prompt API). Everything else runs without it.

## Before you open a PR

```bash
npm run lint && npm run typecheck && npm test   # unit tests
npm run build && npm run e2e                    # static export + Playwright
```

The repository needs the seven `NEXT_PUBLIC_FIREBASE_*` / `NEXT_PUBLIC_RECAPTCHA_*` values as Actions **variables** (they are public config, see `.env.example`) or CI fails fast on the build step.

- Keep the acceptance gate (`src/gate/`) in code: a value is accepted only if it appears in the paste and passes the field's format check. Never replace it with a model "confidence".
- Pasted customer text must never reach the cloud path. `node scripts/egress_check.mjs` (needs a headed Chrome with Gemini Nano; no CI job runs it) must still report 0 paste-token hits.
- A number in the README or DEMO.md must trace to a file in `evidence/`.
- Add a regression test named after the defect it prevents.

## Reporting bugs and requesting features

Use the issue templates. For a security problem, do not open an issue: see [SECURITY.md](SECURITY.md).
