# API Reference

Base URL: `http://127.0.0.1:3141`

Interactive docs (Scalar UI) are available at **http://127.0.0.1:3141/docs** while the server is running. The raw OpenAPI spec is at `/openapi.json`.

---

## Authentication

### `POST /auth/login`
Opens a headed Chromium window. Complete your Scalable Capital login and 2FA there. The server extracts and persists the session automatically.

If a valid session already exists, returns immediately without opening a browser.

```bash
curl -X POST http://127.0.0.1:3141/auth/login
```

```json
{
  "message": "Login successful.",
  "personId": "abc123",
  "portfolioId": "xyz456",
  "expiresAt": 1772258400000
}
```

---

### `GET /auth/status`
Returns the current session state without triggering a login.

```bash
curl http://127.0.0.1:3141/auth/status
```

```json
{
  "authenticated": true,
  "personId": "abc123",
  "portfolioId": "xyz456",
  "valuation": 62195.29,
  "expiresAt": 1772258400000
}
```

---

### `DELETE /auth/logout`
Clears the persisted session. The next request to a protected endpoint will return `401`.

```bash
curl -X DELETE http://127.0.0.1:3141/auth/logout
```

---

## Portfolio

### `GET /portfolio`
Returns the current portfolio valuation. Subscribes transiently to the real-time WebSocket to get a live snapshot (up to 3 s), then falls back to the login-time value if the subscription times out.

```bash
curl http://127.0.0.1:3141/portfolio
```

**Live response** (`source: "realtime"`):
```json
{
  "source": "realtime",
  "valuation": 62195.29,
  "securitiesValuation": 54287.02,
  "cryptoValuation": 0,
  "unrealisedReturn": {
    "absoluteUnrealisedReturn": 9306.48,
    "relativeUnrealisedReturn": 0.2069
  },
  "timeWeightedReturnByTimeframe": [
    { "timeframe": "INTRADAY",       "performance": 0,      "simpleAbsoluteReturn": -239.28 },
    { "timeframe": "TWO_DAYS",       "performance": 0,      "simpleAbsoluteReturn": -239.28 },
    { "timeframe": "ONE_WEEK",       "performance": 0,      "simpleAbsoluteReturn":  251.90 },
    { "timeframe": "ONE_MONTH",      "performance": 0,      "simpleAbsoluteReturn":  727.42 },
    { "timeframe": "THREE_MONTHS",   "performance": 0,      "simpleAbsoluteReturn": 1672.42 },
    { "timeframe": "SIX_MONTHS",     "performance": 0,      "simpleAbsoluteReturn": 4580.49 },
    { "timeframe": "ONE_YEAR",       "performance": 0,      "simpleAbsoluteReturn": 3859.60 },
    { "timeframe": "YEAR_TO_DATE",   "performance": 0,      "simpleAbsoluteReturn": 1291.29 },
    { "timeframe": "MAX",            "performance": 0,      "simpleAbsoluteReturn": 11571.82 }
  ],
  "timestampUtc": { "time": "2026-02-27T22:00:00.000Z", "epochMillisecond": 1772229600000 }
}
```

**Fallback response** (`source: "session"`) — returned when no live tick arrives within 3 s:
```json
{
  "source": "session",
  "valuation": 62195.29
}
```

---

## Real-time streams (SSE)

Both endpoints use [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events). Each event is an unnamed `data:` line containing a JSON payload followed by a blank line. The connection stays open until you close it.

The underlying WebSocket to Scalable Capital is shared across all active stream clients — only one connection is ever open regardless of how many SSE clients are connected.

```js
// Browser / Node.js EventSource
const es = new EventSource('http://127.0.0.1:3141/valuation/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

### `GET /valuation/stream`
Streams real-time portfolio valuation ticks. The WebSocket subscription opens on the first client and closes on the last.

```bash
curl -N http://127.0.0.1:3141/valuation/stream
```

Each event carries the same shape as `GET /portfolio` with `source: "realtime"`:

```
data: {"id":"xyz456","valuation":62195.29,"securitiesValuation":54287.02,"cryptoValuation":0,"unrealisedReturn":{"absoluteUnrealisedReturn":9306.48,"relativeUnrealisedReturn":0.2069},"timeWeightedReturnByTimeframe":[...],"timestampUtc":{"time":"2026-02-27T22:00:00.000Z","epochMillisecond":1772229600000}}
```

---

### `GET /quotes/stream?isins=ISIN1,ISIN2,...`
Streams real-time bid/ask/mid price ticks for the given ISINs. Multiple connected clients share a single upstream subscription; the ISIN union is recomputed automatically when clients connect or disconnect.

```bash
curl -N "http://127.0.0.1:3141/quotes/stream?isins=US02079K3059,DE0005557508"
```

Each event is a single `QuoteTick`:

```
data: {"id":"xyz456US02079K3059","isin":"US02079K3059","midPrice":189.45,"bidPrice":189.40,"askPrice":189.50,"currency":"EUR","isOutdated":false,"time":"2026-02-27T22:59:57","timestampUtc":{"time":"2026-02-27T21:59:57.000Z","epochMillisecond":1740697197000},"performanceDate":{"date":"2026-02-27"},"performancesByTimeframe":[{"timeframe":"INTRADAY","performance":-0.0032,"simpleAbsoluteReturn":-0.61},{"timeframe":"SINCE_BUY","performance":0.3675,"simpleAbsoluteReturn":410.17},...]}
```

**Available timeframes in `performancesByTimeframe`:**

| Timeframe | Description |
|---|---|
| `INTRADAY` | Since market open today |
| `TWO_DAYS` | Last two trading days |
| `ONE_WEEK` | Last 7 days |
| `ONE_MONTH` | Last 30 days |
| `THREE_MONTHS` | Last 3 months |
| `SIX_MONTHS` | Last 6 months |
| `ONE_YEAR` | Last 12 months |
| `YEAR_TO_DATE` | Since 1 Jan |
| `MAX` | Since first available price |
| `SINCE_BUY` | Since your average purchase price (only present if you hold the position) |

---

## Raw GraphQL proxy

### `POST /proxy`
Forwards a raw GraphQL operation to Scalable Capital's API with your session credentials. Useful for replaying requests captured in browser devtools.

```bash
curl -X POST http://127.0.0.1:3141/proxy \
  -H 'Content-Type: application/json' \
  -d '{
    "operationName": "YourOperation",
    "query": "query YourOperation { ... }",
    "variables": {}
  }'
```

The response is the raw GraphQL JSON returned by Scalable Capital.

---

## Diagnostics

### `GET /health`
Always returns `200`. No authentication required. Useful for checking whether the server is up.

```bash
curl http://127.0.0.1:3141/health
# {"status":"ok"}
```

---

## Gateway token

If the server was started with `--token <secret>`, every request (except `/auth/*` and `/docs`) must include the header:

```
X-Gateway-Token: <secret>
```

```bash
curl -H 'X-Gateway-Token: my-secret' http://127.0.0.1:3141/portfolio
```
