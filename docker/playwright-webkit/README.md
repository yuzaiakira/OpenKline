# WebKit / Mobile Safari verification

Host systems that lack Playwright WebKit libraries (`libicu74`, `libflite1`, …)
cannot launch WebKit natively. Use either:

1. This Docker image (local), or
2. GitHub Actions workflow `.github/workflows/webkit-compat.yml`.

Do **not** substitute Chromium results for WebKit. Mobile Safari emulation is
**not** physical iOS Safari.

## Local Docker

```bash
# Requires a working Docker daemon and membership in the docker group.
docker build -f docker/playwright-webkit/Dockerfile -t openkline-playwright-webkit:1.64.1 .

# Prefer --user so mounted workspace artifacts are not root-owned.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e CI=true \
  -e HOME=/tmp \
  openkline-playwright-webkit:1.64.1 \
  npx playwright test --project=webkit --project=mobile-safari \
    tests/browser/widget-quality-gates.spec.ts \
    tests/browser/widget-developer-integration.spec.ts

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e CI=true \
  -e HOME=/tmp \
  openkline-playwright-webkit:1.64.1 \
  npx playwright test --project=webkit \
    tests/browser/widget-datafeed-integrity.spec.ts \
    tests/browser/widget-multichart.spec.ts
```

Playwright package version must remain aligned with the image tag
(`mcr.microsoft.com/playwright:v1.64.1-jammy` ↔ `@playwright/test@^1.64.1`).

## CI

Pushing changes under the workflow path filters (or dispatching
`webkit-compat`) runs the same projects on `ubuntu-22.04` inside the official
Playwright container. Inspect the Actions run logs and uploaded
`webkit-playwright-report` artifact before claiming CI PASS.

## Studio React compatibility (optional)

When the daemon is available, the same image can run Studio React tests via
`playwright.react.compat.config.ts` (production Next server on port 4175):

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e CI=true \
  -e HOME=/tmp \
  openkline-playwright-webkit:1.64.1 \
  npx playwright test --config playwright.react.compat.config.ts \
    --project=studio-webkit --project=studio-mobile-safari \
    -g "import quarantines|dirty-state protects Load"
```

Host-native Firefox Studio evidence uses `npm run test:react:compat:firefox`
with `PLAYWRIGHT_BROWSERS_PATH` pointing at a complete Playwright cache.

## Evidence boundary

| Claim | Valid evidence |
| --- | --- |
| WebKit PASS | Log with non-skipped passing tests from Docker or CI |
| Mobile Safari emulation PASS | Playwright `mobile-safari` project results |
| Physical iOS Safari PASS | Device protocol evidence only |
