# Troubleshooting

## npm cannot create `/home/agent/.npm`

The cloud image may expose a read-only home directory. Use the repository's
cache-safe commands or set:

```bash
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm ci --ignore-scripts --no-audit --no-fund
```

## Browser tests do not start

`npm run test:browser` uses the cloud's configured Chromium diagnostic setup
and passes container-safe flags. It does not establish formal managed-browser
coverage for Firefox, WebKit, or Mobile Safari. On a trusted machine, do not
edit `playwright.portable.config.ts` to add a host path; install official
Playwright browsers and run `npm run browser:verify`. A launch failure is
blocked or failed evidence, never a successful smoke check.

## Chart is blank

Confirm the container has a non-zero height, call `setData` with UTC
millisecond timestamps, and check that every candle satisfies the OHLC rules.
For a fixed-size chart, pass `width` and `height` or call `resize` after the
container becomes visible.
