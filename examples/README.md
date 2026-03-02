# Examples

Ready-to-run scripts that show what you can build with the API.

**Prerequisite:** the API server must be running before using any example.

```bash
npm run dev
# or with a gateway token:
npm run dev -- --token my-secret
```

---

## `price-alert.ts` — Desktop notifications on price thresholds

Subscribes to live quote ticks for one ISIN and fires a desktop notification when the mid price crosses a threshold. Works on macOS, Linux, and Windows.

```bash
# Alert when IWDA crosses above 100
tsx examples/price-alert.ts --isin IE00B4L5Y983 --above 100

# Alert when it drops below 90 (with gateway token)
tsx examples/price-alert.ts --isin IE00B4L5Y983 --below 90 --token my-secret

# Just print live ticks without alerting
tsx examples/price-alert.ts --isin IE00B4L5Y983
```

| Flag | Description |
|------|-------------|
| `--isin` | ISIN to watch (required) |
| `--above` | Alert when mid price exceeds this value |
| `--below` | Alert when mid price drops below this value |
| `--token` | Gateway token, if `--token` was set on the server |
| `--port` | Server port (default: `3141`) |

---

## `export-transactions-csv.ts` — Full transaction history to CSV

Paginates through all your transactions and writes them to a CSV file.

```bash
tsx examples/export-transactions-csv.ts

# Custom output path:
tsx examples/export-transactions-csv.ts --out my-trades.csv --token my-secret
```

| Flag | Default | Description |
|------|---------|-------------|
| `--out` | `transactions.csv` | Output file path |
| `--page-size` | `100` | Transactions fetched per request |
| `--token` | — | Gateway token |
| `--port` | `3141` | Server port |

---

## `grafana/` — Live Grafana dashboard

A `docker-compose.yml` that spins up Grafana with the [Infinity](https://grafana.com/grafana/plugins/yesoreyeram-infinity-datasource/) datasource pre-configured to pull from the local API. The **Scalable Capital Portfolio** dashboard is provisioned automatically.

**Requires:** Docker with Compose

```bash
cd examples/grafana
docker compose up -d
open http://localhost:3000   # admin / admin
```

The dashboard shows:

- Total portfolio value, securities valuation, unrealised return, crypto valuation
- Performance by timeframe (1D / 1W / 1M / YTD / ALL)

Grafana polls `/portfolio` every 30 seconds.

### Using a gateway token

```bash
GATEWAY_TOKEN=my-secret 
docker compose up -d
```

Then uncomment the `httpHeaderName1` / `secureJsonData` lines in
[`provisioning/datasources/scalable.yaml`](./grafana/provisioning/datasources/scalable.yaml).