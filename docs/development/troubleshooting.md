# Troubleshooting

## npm cannot create `/home/agent/.npm`

The cloud image may expose a read-only home directory. Use the repository's
cache-safe commands or set:

```bash
NPM_CONFIG_CACHE=/tmp/openkline-npm-cache npm ci --ignore-scripts --no-audit --no-fund
```

## Browser tests do not start

`npm run test:browser` uses `/usr/bin/chromium` in the cloud environment and
passes container-safe flags. On another machine, update
`playwright.config.ts` with the installed Chromium path or remove
`executablePath` to use Playwright's managed browser. A timeout is a blocked
test, not a successful smoke check.

## Chart is blank

Confirm the container has a non-zero height, call `setData` with UTC
millisecond timestamps, and check that every candle satisfies the OHLC rules.
For a fixed-size chart, pass `width` and `height` or call `resize` after the
container becomes visible.
