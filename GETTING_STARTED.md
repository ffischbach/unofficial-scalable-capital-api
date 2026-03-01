# Getting Started

This guide walks you through running the Unofficial Scalable Capital API on your machine and making your first requests.

## Prerequisites

- **Node.js 22 or later** — check with `node --version`
- **A Scalable Capital brokerage account** (Broker, not just the app)

## 1. Install dependencies

```bash
npm install
```

## 2. Start the server

```bash
npm run dev
```

You should see:

```
╔══════════════════════════════════════════════════╗
║    Unofficial Scalable Capital API Gateway        ║
╠══════════════════════════════════════════════════╣
║  Listening on  http://127.0.0.1:3141             ║
...
```

The server only listens on `127.0.0.1` — it is never exposed to your network.

## 3. Log in

```bash
curl -X POST http://127.0.0.1:3141/auth/login
```

A Chromium browser window will open. **Log in normally**, including any 2FA step. You have up to 2 minutes to complete this.

Once done, the browser closes automatically and your session is saved to `session.json`. You won't need to log in again for 8 hours (or until you restart and the file is still there).

Check that it worked:

```bash
curl http://127.0.0.1:3141/auth/status
```

You should see your `portfolioId`, `personId`, and session expiry time.

## 4. Stream real-time portfolio data

```bash
curl -N http://127.0.0.1:3141/valuation/stream
```

The `-N` flag disables buffering so you see events as they arrive. Each line starting with `data:` is a JSON snapshot of your portfolio:

```
data: {"id":"your-portfolio-id","valuation":62195.29,"securitiesValuation":54287.02,...}
```

Press `Ctrl+C` to stop.

## 5. Send a raw GraphQL request

If you've captured a GraphQL operation from Scalable's app in browser devtools, replay it via the proxy endpoint:

```bash
curl -X POST http://127.0.0.1:3141/proxy \
  -H 'Content-Type: application/json' \
  -d '{
    "operationName": "YourOperation",
    "query": "query YourOperation { ... }",
    "variables": {}
  }'
```

## Optional: protect with a token

If you want to prevent other processes on your machine from talking to the API, start with a secret token:

```bash
npm run dev -- --token my-secret
```

Then include the header in every request (except `/auth/*`):

```bash
curl -H 'X-Gateway-Token: my-secret' http://127.0.0.1:3141/valuation/stream -N
```

## Optional: custom port

```bash
npm run dev -- --port 8080
```

## Logging out

```bash
curl -X DELETE http://127.0.0.1:3141/auth/logout
```

This clears the in-memory session and deletes `session.json`. You'll need to log in again for subsequent requests.

## Troubleshooting

**Login browser closes before I finish** — you have 2 minutes. If Scalable's site is slow, try again.

**`401 Not authenticated`** — run `POST /auth/login` first, or your session expired (8-hour TTL). Check `GET /auth/status`.

**`/valuation/stream` hangs with no data** — Scalable only pushes updates when market prices change. During off-hours you may see no events for a while. Confirm the connection is alive by checking server logs for `[subscription] Connected`.

**Port already in use** — use `--port` to pick a different one, or find and stop the conflicting process.
