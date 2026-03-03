# Unofficial Scalable Capital API

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Unofficial](https://img.shields.io/badge/status-unofficial-orange)

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

## Examples

Ready-to-run scripts are in the [`examples/`](./examples) directory:

| Script | Description |
|--------|-------------|
| [`price-alert.ts`](./examples/price-alert.ts) | Desktop notification when a quote crosses a price threshold |
| [`export-transactions-csv.ts`](./examples/export-transactions-csv.ts) | Export your full transaction history to a CSV file |
| [`grafana/`](./examples/grafana) | Live Grafana dashboard — spin up with `docker compose up` |

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

| Flag        | Default | Description                                               |
|-------------|---------|-----------------------------------------------------------|
| `--port`    | `3141`  | Port to listen on                                         |
| `--token`   | (none)  | Require `X-Gateway-Token` header on all non-auth requests |
| `--monitor` | off     | Enable API change detection (writes to `api-changes.json`) |

## Session Security

`session.json` contains your authentication cookies with full account access. It is written with mode `0600` (owner read/write only) and excluded from git. Never share or commit it.

## API Change Detection

Scalable Capital's internal API is not publicly documented and can change at any time. This project includes an opt-in monitor that detects structural changes to every GraphQL response and WebSocket subscription message before they silently break things.

```bash
npm run dev -- --monitor
```

When a change is detected it is logged to the console and appended to `api-changes.json` (one unique entry per change, survives restarts).

### Reporting changes as GitHub issues

After the server has collected changes, pick the option that fits your setup:

```bash
# Automatic — files issues via the gh CLI, writes URLs back to api-changes.json
npm run report-changes

# Copy-paste — prints ready-to-paste title + body for each pending change
npm run report-changes:print
```

Both commands read `api-changes.json` and skip entries that already have an issue URL. The automatic mode requires the [`gh` CLI](https://cli.github.com/) to be installed and authenticated (`gh auth login`). The copy-paste mode opens `https://github.com/ffischbach/unofficial-scalabale-capital-api/issues/new` and you paste the printed title and body — no tooling needed.

### If an endpoint breaks for you

1. Check `api-changes.json` — each entry shows the operation name, JSON path, and kind of change (`added` / `removed` / `type-changed`)
2. Look for a matching [open issue](https://github.com/ffischbach/unofficial-scalabale-capital-api/issues)
3. If not, run `npm run report-changes` or [open one manually](https://github.com/ffischbach/unofficial-scalabale-capital-api/issues/new) with the relevant entry from `api-changes.json`

### Re-baselining after a fix is merged

Open `api-snapshot.json` in an editor and delete the key for the fixed operation. Or use `jq`:

```bash
# Remove one operation's baseline (keeps all others intact)
jq 'del(.["<OperationName>"])' api-snapshot.json > tmp.json && mv tmp.json api-snapshot.json

# Or wipe everything and re-snapshot from scratch
rm api-snapshot.json api-changes.json
```

Restart the server — it will re-snapshot on the next request.
