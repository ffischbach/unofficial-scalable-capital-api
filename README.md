# Unofficial Scalable Capital API

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Unofficial](https://img.shields.io/badge/status-unofficial-orange)

> **Legal warning:** This project may violate Scalable Capital's Terms of Service. Use may result in account suspension or termination. Not affiliated with or endorsed by Scalable Capital GmbH. The API may break without notice. Authors accept no liability.

Scalable Capital doesn't offer a public API. This project fills that gap: a local HTTP proxy that handles authentication (including 2FA) via a headed browser window, then exposes your portfolio data through a REST API on `localhost`. Your credentials never leave your machine.

## What you can build with it

- **Live dashboards** — stream real-time portfolio valuation into Grafana, a custom web UI, or a home screen widget
- **Price alerts** — subscribe to live quote ticks for your ISINs and trigger notifications on thresholds
- **Transaction exports** — pull your full transaction history into a spreadsheet, database, or accounting tool
- **Custom analytics** — calculate metrics Scalable doesn't show (e.g. time-weighted returns, sector allocation)
- **Portfolio snapshots** — schedule a cron job to record daily valuations for long-term tracking

## Prerequisites

- Node.js 22+
- A Scalable Capital brokerage account

## Setup

```bash
npm install
npm run dev
# or with options:
npm run dev -- --port 3141 --token my-secret-token
```

The server listens on `http://127.0.0.1:3141` (loopback only).

### CLI Options

| Flag        | Default | Description                                               |
|-------------|---------|-----------------------------------------------------------|
| `--port`    | `3141`  | Port to listen on                                         |
| `--token`   | (none)  | Require `X-Gateway-Token` header on all non-auth requests |
| `--monitor` | off     | Enable API change detection (writes to `api-changes.json`) |

## Authentication

1. `POST /auth/login` — opens a Chromium browser window
2. Complete your login and 2FA in the browser
3. The session is saved to `session.json` and reused on restart (valid for 8 hours)

`session.json` contains authentication cookies with full account access. It is written with mode `0600` (owner read/write only) and excluded from git. Never share or commit it.

## API Reference

Interactive docs are available at **http://127.0.0.1:3141/docs** once the server is running (raw OpenAPI spec at `/openapi.json`, also [hosted here](https://ffischbach.github.io/unofficial-scalable-capital-api/)).

### Auth & Health

| Method   | Path           | Description                         |
|----------|----------------|-------------------------------------|
| `GET`    | `/health`      | Liveness check                      |
| `GET`    | `/auth/status` | Whether a valid session is loaded   |
| `POST`   | `/auth/login`  | Opens browser for interactive login |
| `DELETE` | `/auth/logout` | Clears the current session          |

### Portfolio

| Method | Path                             | Description                                              |
|--------|----------------------------------|----------------------------------------------------------|
| `GET`  | `/portfolio`                     | Portfolio snapshot: total value, returns (cached 30 s)   |
| `GET`  | `/portfolio/inventory`           | Full inventory by group with performance                 |
| `GET`  | `/portfolio/watchlist`           | Watchlist securities with quote ticks                    |
| `GET`  | `/portfolio/cash`                | Buying power, derivatives buying power, withdrawal power |
| `GET`  | `/portfolio/interest-rates`      | Deposit and overdraft interest rates                     |
| `GET`  | `/portfolio/pending-orders`      | Count of pending orders                                  |
| `GET`  | `/portfolio/appropriateness`     | MiFID II appropriateness assessment result               |
| `GET`  | `/portfolio/crypto-performance`  | Crypto valuation and unrealised return                   |
| `GET`  | `/portfolio/timeseries`          | Portfolio value and absolute return across timeframes    |

### Live Data (SSE)

| Method | Path                                    | Description                                         |
|--------|-----------------------------------------|-----------------------------------------------------|
| `GET`  | `/valuation/stream`                     | Real-time total portfolio valuation                 |
| `GET`  | `/quotes/stream?isins=IE00B4L5Y983,…`  | Real-time bid/ask/mid prices per ISIN               |

### Securities

| Method | Path                              | Description                                            |
|--------|-----------------------------------|--------------------------------------------------------|
| `GET`  | `/securities/:isin`               | Full security data: metadata, inventory, quote tick    |
| `GET`  | `/securities/:isin/info`          | Core metadata and holdings                             |
| `GET`  | `/securities/:isin/static`        | Static metadata only                                   |
| `GET`  | `/securities/:isin/tick`          | Latest quote with bid/ask/mid and performance          |
| `GET`  | `/securities/:isin/timeseries`    | Historical OHLC data (`?timeframes=1D,1W,1M,…`)        |
| `GET`  | `/securities/:isin/tradability`   | Buy/sell tradability status across venues              |
| `GET`  | `/securities/:isin/buyable`       | Buyability check across portfolios                     |

### Transactions

| Method | Path                  | Description                                                          |
|--------|-----------------------|----------------------------------------------------------------------|
| `GET`  | `/transactions`       | Transaction history — paginated (`?pageSize`, `?cursor`, `?isin`, `?type`, `?status`, `?searchTerm`) |
| `GET`  | `/transactions/:id`   | Single transaction details                                           |

### Savings (Tagesgeld)

| Method | Path                    | Description                                                      |
|--------|-------------------------|------------------------------------------------------------------|
| `GET`  | `/savings`              | Balance, interest rate, next payout date (503 if no account)    |
| `GET`  | `/savings/transactions` | Savings transaction history (`?limit=50`)                        |

### Other

| Method | Path     | Description                          |
|--------|----------|--------------------------------------|
| `POST` | `/proxy` | Pass-through for raw GraphQL queries |

### Quick example

```bash
# Log in
curl -s -X POST http://127.0.0.1:3141/auth/login

# Fetch portfolio snapshot
curl -s http://127.0.0.1:3141/portfolio | jq .

# Fetch security info
curl -s http://127.0.0.1:3141/securities/IE00B4L5Y983 | jq .

# Stream live valuation updates (Ctrl+C to stop)
curl -N http://127.0.0.1:3141/valuation/stream

# Stream live quotes for two ETFs
curl -N "http://127.0.0.1:3141/quotes/stream?isins=IE00B4L5Y983,LU0290358497"
```

With `--token` set, add `-H "X-Gateway-Token: <your-token>"` to every request.

## Examples

Ready-to-run scripts are in the [`examples/`](./examples) directory:

| Script | Description |
|--------|-------------|
| [`price-alert.ts`](./examples/price-alert.ts) | Desktop notification when a quote crosses a price threshold |
| [`export-transactions-csv.ts`](./examples/export-transactions-csv.ts) | Export your full transaction history to a CSV file |
| [`grafana/`](./examples/grafana) | Live Grafana dashboard — spin up with `docker compose up` |

## API Change Detection

Scalable Capital's internal API is undocumented and can change at any time. The optional monitor detects structural changes to every GraphQL response and WebSocket message before they silently break things.

```bash
npm run dev -- --monitor
```

Changes are logged to the console and appended to `api-changes.json` (one unique entry per change, survives restarts).

### Reporting changes

```bash
# Automatic — files GitHub issues via the gh CLI
npm run report-changes

# Copy-paste — prints title + body for manual submission
npm run report-changes:print
```

Both commands skip entries that already have an issue URL. The automatic mode requires the [`gh` CLI](https://cli.github.com/) (`gh auth login`).

### If an endpoint breaks

1. Check `api-changes.json` — each entry shows the operation, JSON path, and change kind (`added` / `removed` / `type-changed`)
2. Look for a matching [open issue](https://github.com/ffischbach/unofficial-scalabale-capital-api/issues)
3. If not, run `npm run report-changes` or [open one manually](https://github.com/ffischbach/unofficial-scalabale-capital-api/issues/new)

### Re-baselining after a fix

```bash
# Remove one operation's baseline
jq 'del(.["<OperationName>"])' api-snapshot.json > tmp.json && mv tmp.json api-snapshot.json

# Or wipe everything and re-snapshot from scratch
rm api-snapshot.json api-changes.json
```

Restart the server — it will re-snapshot on the next request.
