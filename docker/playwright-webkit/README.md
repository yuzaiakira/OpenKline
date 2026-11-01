# WebKit verification container

Host systems that only have ICU 78+ (or lack `libflite1`) cannot launch
Playwright's WebKit build. Use this image when local WebKit is BLOCKED.

```bash
# From repository root:
docker build -f docker/playwright-webkit/Dockerfile -t openkline-playwright-webkit .
docker run --rm openkline-playwright-webkit

# Focused Mobile Safari emulation:
docker run --rm openkline-playwright-webkit \
  npx playwright test --project=mobile-safari tests/browser/widget-quality-gates.spec.ts
```

Physical iOS Safari remains NOT TESTED unless a real device run is recorded.
