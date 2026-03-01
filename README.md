# Unofficial Scalable Capital API

A local HTTP proxy that authenticates with Scalable Capital's private GraphQL API using Puppeteer for interactive login (including 2FA), then serves authenticated requests via a local Express server.

## Prerequisites

- Node.js 22+
- A Scalable Capital brokerage account

## Setup

```bash
npm install
```

## Usage

```bash
npm run dev
# or with options:
npm run dev -- --port 3141 --token my-secret-token
```

The server listens on `http://127.0.0.1:3141` (loopback only, not exposed to the network).

## Authentication Flow

1. `POST /auth/login` — opens a Chromium browser window
2. Complete your login and 2FA in the browser (you have up to 2 minutes)
3. The browser extracts your session cookies, personId, portfolioId, and portfolio valuation
4. The session is saved to `session.json` (excluded from git) and restored on restart

## Endpoints

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| `GET` | `/health` | No | Health check |
| `GET` | `/auth/status` | No | Current session info |
| `POST` | `/auth/login` | No | Start interactive login |
| `DELETE` | `/auth/logout` | No | Clear session |
| `POST` | `/proxy` | Yes | Raw GraphQL passthrough |
| `GET` | `/valuation/stream` | Yes | Real-time portfolio valuation (SSE) |

### GET /valuation/stream

Server-Sent Events stream of live portfolio data pushed by Scalable Capital. Opens a single upstream WebSocket (`wss://de.scalable.capital/broker/subscriptions`) shared across all connected clients, and fans out each `realTimeValuation` event as an SSE message.

**curl:**
```bash
curl -N http://127.0.0.1:3141/valuation/stream
```

**Browser / JavaScript:**
```js
const es = new EventSource('http://127.0.0.1:3141/valuation/stream');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.valuation);           // total portfolio value
  console.log(data.securitiesValuation); // equities/ETF portion
  console.log(data.unrealisedReturn);    // { absoluteUnrealisedReturn, relativeUnrealisedReturn }
  console.log(data.timeWeightedReturnByTimeframe); // INTRADAY, ONE_WEEK, ONE_MONTH, …
};

es.onerror = () => es.close();
```

**Node.js:**
```js
const res = await fetch('http://127.0.0.1:3141/valuation/stream');
const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split('\n')) {
    if (line.startsWith('data: ')) {
      console.log(JSON.parse(line.slice(6)));
    }
  }
}
```

The upstream WebSocket connects lazily on the first client connection and disconnects automatically when the last client disconnects. It reconnects automatically after 5 seconds if the connection drops.

### POST /proxy

Use browser devtools to capture GraphQL operations, then replay them via `/proxy`:

```bash
curl -X POST http://127.0.0.1:3141/proxy \
  -H 'Content-Type: application/json' \
  -d '{
    "operationName": "someOperation",
    "query": "query someOperation(...) { ... }",
    "variables": {}
  }'
```

### Gateway Token (optional)

Start with `--token <secret>` to require an `X-Gateway-Token` header on all non-auth routes:

```bash
npm run dev -- --token my-secret
curl -H 'X-Gateway-Token: my-secret' -X POST http://127.0.0.1:3141/proxy \
  -H 'Content-Type: application/json' \
  -d '{"operationName":"...","query":"...","variables":{}}'
```

## Session Security

`session.json` contains your authentication cookies with full account access. It is:
- Written with mode `0600` (owner read/write only)
- Excluded from git via `.gitignore`
- Valid for 8 hours before expiring

Never share or commit `session.json`.

## CLI Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `3141` | Port to listen on |
| `--token` | (none) | Require X-Gateway-Token header |
