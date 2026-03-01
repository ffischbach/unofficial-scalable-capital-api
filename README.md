# Unofficial Scalable Capital API

> **⚠️ Legal warning:** This project may violates Scalable Capital's Terms of Service. Using it may result in the suspension or termination of your brokerage account. Use at your own risk. This project is not affiliated with or endorsed by Scalable Capital GmbH. This API may break without notice whenever the official API changes. The authors accept no liability for any damages or account actions resulting from its use.

Scalable Capital doesn't offer a public API. This project fills that gap: it's a local HTTP proxy that handles authentication (including 2FA) via a headed browser window, then exposes your portfolio data through a simple REST API on `localhost`. Your credentials never leave your machine.

## What you can build with it

- **Live dashboards** — stream real-time portfolio valuation into Grafana, a custom web UI, or a home screen widget
- **Price alerts** — subscribe to live quote ticks for your held ISINs and trigger notifications on thresholds
- **Transaction exports** — pull your full transaction history into a spreadsheet, database, or accounting tool
- **Custom analytics** — calculate metrics Scalable doesn't show (e.g. time-weighted returns, sector allocation) using your own scripts
- **Portfolio snapshots** — schedule a cron job to record daily valuations for long-term tracking

## Available data

| Category | Data |
|----------|------|
| **Portfolio valuation** | Total value, securities valuation, crypto valuation, unrealised return (absolute + relative) |
| **Performance** | Time-weighted returns by timeframe: 1D, 1W, 1M, YTD, ALL — absolute and relative |
| **Live valuation** | Real-time total portfolio value streamed via SSE as it changes |
| **Live quotes** | Bid, ask, and mid price per ISIN with per-timeframe performance, streamed via SSE |
| **Transactions** | Full history with type, status, date, description, amount, ISIN, and buy/sell side; cursor-paginated |
| **Transaction details** | Individual transaction breakdown by ID |

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
2. Complete your login and 2FA in the browser
3. The session is saved to `session.json` and restored on restart (valid for 8 hours)

## API Reference

Once the server is running, interactive docs are also available at **http://127.0.0.1:3141/docs** (raw OpenAPI spec at `/openapi.json`).

### Endpoints

| Method     | Path                                   | Description                           |
|------------|----------------------------------------|---------------------------------------|
| `GET`      | `/health`                              | Liveness check                        |
| `GET`      | `/auth/status`                         | Whether a valid session is loaded     |
| `POST`     | `/auth/login`                          | Opens browser for interactive login   |
| `DELETE`   | `/auth/logout`                         | Clears the current session            |
| `GET`      | `/portfolio`                           | Current portfolio snapshot (cached)   |
| `GET`      | `/valuation/stream`                    | Real-time total valuation (SSE)       |
| `GET`      | `/quotes/stream?isins=IE00B4L5Y983,…` | Real-time quote ticks per ISIN (SSE)  |
| `GET`      | `/transactions`                        | Transaction history                   |
| `GET`      | `/transactions/:id`                    | Single transaction details            |
| `POST`     | `/proxy`                               | Pass-through for raw GraphQL queries  |

### Quick example

```bash
# Start the server, then log in
curl -s -X POST http://127.0.0.1:3141/auth/login

# Fetch your portfolio
curl -s http://127.0.0.1:3141/portfolio | jq .

# Stream live valuation updates (Ctrl+C to stop)
curl -N http://127.0.0.1:3141/valuation/stream

# Stream live quotes for two ETFs
curl -N "http://127.0.0.1:3141/quotes/stream?isins=IE00B4L5Y983,LU0290358497"
```

With the `--token` flag set, add `-H "X-Gateway-Token: <your-token>"` to every request.

## CLI Options

| Flag      | Default | Description                                               |
|-----------|---------|-----------------------------------------------------------|
| `--port`  | `3141`  | Port to listen on                                         |
| `--token` | (none)  | Require `X-Gateway-Token` header on all non-auth requests |

## Session Security

`session.json` contains your authentication cookies with full account access. It is written with mode `0600` (owner read/write only) and excluded from git. Never share or commit it.

## Stability

This project targets Scalable Capital's internal API, which is not publicly documented and can change at any time. If requests start failing after a Scalable app update, the GraphQL query shapes or authentication flow may need to be updated.
