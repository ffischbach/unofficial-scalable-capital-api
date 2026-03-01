# Unofficial Scalable Capital API

> **Disclaimer:** This project is not affiliated with or endorsed by Scalable Capital GmbH. It reverse-engineers their private, undocumented GraphQL API — which means it may break without notice whenever they update their web app. Use it for personal automation only and never share your credentials or session file.

Scalable Capital doesn't offer a public API. This project fills that gap: it's a local HTTP proxy that handles authentication (including 2FA) via a headed browser window, then exposes your portfolio data through a simple REST API on `localhost`. Your credentials never leave your machine.

## What you can build with it

- **Live dashboards** — stream real-time portfolio valuation into Grafana, a custom web UI, or a home screen widget
- **Price alerts** — subscribe to live quote ticks for your held ISINs and trigger notifications on thresholds
- **Transaction exports** — pull your full transaction history into a spreadsheet, database, or accounting tool
- **Custom analytics** — calculate metrics Scalable doesn't show (e.g. time-weighted returns, sector allocation) using your own scripts
- **Portfolio snapshots** — schedule a cron job to record daily valuations for long-term tracking

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
