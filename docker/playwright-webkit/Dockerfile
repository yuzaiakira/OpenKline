# Reproducible WebKit / Mobile Safari verification image for hosts that lack
# Playwright WebKit system libraries (libicu74, libflite1, etc.).
# Does not substitute Chromium for WebKit results.
FROM mcr.microsoft.com/playwright:v1.64.1-jammy

WORKDIR /work
COPY package.json package-lock.json ./
COPY packages/react/package.json packages/react/package.json
COPY examples/nextjs-app-router/package.json examples/nextjs-app-router/package.json
RUN npm ci

COPY . .
RUN npm run build

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
CMD ["npx", "playwright", "test", "--project=webkit", "--project=mobile-safari", "tests/browser/widget-quality-gates.spec.ts"]
