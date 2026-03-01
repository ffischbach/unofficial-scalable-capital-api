# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                          # start server (tsx, no build step)
npm run dev -- --port 8080 --token s # with options
npm run build                        # tsc type-check only (noEmit: true)
```

There are no tests. Type-checking is the only CI gate: `npm run build` must pass after any change.

## Architecture

The project is a local Express 5 HTTP proxy that authenticates with Scalable Capital's private GraphQL API using Puppeteer for interactive login, then serves authenticated data to local clients.

### Request lifecycle

1. **`src/index.ts`** — parses CLI args, loads `session.json` from disk, starts the HTTP server.
2. **`src/server/app.ts`** — Express app factory; mounts routers and the error handler. Gateway token middleware sits here and exempts `/auth/*`.
3. **Routes** call `graphqlRequest()` or `subscriptionManager` which read the singleton session.
4. **`src/scalable/client.ts`** — `graphqlRequest()` builds headers from the session, calls Scalable's GraphQL endpoint, and auto-retries once via `runPuppeteerLogin()` on 401/403 (guarded by a `retried` boolean to prevent loops).
5. **`src/auth/puppeteer-login.ts`** — opens a headed Chromium window, waits for the user to complete login + 2FA, then extracts cookies, `personId` (React fiber walk on `document.body`), `portfolioId` (URL regex), and `valuation` (`__NEXT_DATA__`).

### Session singleton

`src/auth/session.ts` holds a module-level `currentSession` variable. Everything reads it via `getSession()`. Writes go through `persistSession()` which does an atomic tmp-file → `fs.rename()` at mode `0o600`. TTL is 8 hours.

### Real-time valuation (WebSocket → SSE)

`src/scalable/subscription.ts` — singleton `SubscriptionManager`:
- Connects to `wss://de.scalable.capital/broker/subscriptions` using the `graphql-transport-ws` subprotocol with session cookies in the WebSocket headers.
- Lazy: opens on first listener, closes on last, auto-reconnects after 5 s.
- Fans out `realTimeValuation` events to all registered listener callbacks.

`src/server/routes/valuation.ts` — `GET /valuation/stream` subscribes an SSE response to the manager and unsubscribes on client disconnect.

### Key constraints

- **ESM throughout** — `"type": "module"`, `moduleResolution: "bundler"`, `allowImportingTsExtensions: true`. All internal imports use `.ts` extensions. Use `fileURLToPath(import.meta.url)` for `__dirname`.
- **`lib: ["ES2022", "DOM"]`** — DOM types are required for Puppeteer browser-context code (`document`, `window`). Do not remove.
- **Express error handler** — must use the 4-argument `(err, req, res, next)` signature or Express won't recognise it as an error handler.
- **GraphQL URL** — `https://de.scalable.capital/broker/api/data` for queries/mutations; `wss://de.scalable.capital/broker/subscriptions` for subscriptions.
- **Required header** — all GraphQL requests need `x-scacap-features-enabled: CRYPTO_MULTI_ETP,UNIQUE_SECURITY_ID`.
- **Query shape** — `account(id: $personId) { brokerPortfolio(id: $portfolioId) { ... } }`.
