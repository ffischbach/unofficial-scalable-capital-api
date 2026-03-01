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

## API Docs

Once the server is running, open **http://127.0.0.1:3141/docs** in your browser for interactive API documentation. The raw OpenAPI spec is available at `http://127.0.0.1:3141/openapi.json`.

## Authentication Flow

1. `POST /auth/login` — opens a Chromium browser window
2. Complete your login and 2FA in the browser
3. The session is saved to `session.json` and restored on restart (valid for 8 hours)

## CLI Options

| Flag      | Default | Description                                               |
|-----------|---------|-----------------------------------------------------------|
| `--port`  | `3141`  | Port to listen on                                         |
| `--token` | (none)  | Require `X-Gateway-Token` header on all non-auth requests |

## Session Security

`session.json` contains your authentication cookies with full account access. It is written with mode `0600` (owner read/write only) and excluded from git. Never share or commit it.
