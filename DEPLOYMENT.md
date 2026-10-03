# Deployment

Running this permanently on your own machine works, but a small homeserver or
Raspberry Pi on your LAN is a better fit for keeping it up 24/7 — especially
if it's one of several self-hosted projects on that box, where a per-project
Docker container avoids each one fighting over host-wide Node/Chromium
versions. The [auto-refresh mechanism](./README.md#authentication) keeps the
session alive headlessly once logged in, so the container never needs a
display after the first login.

A `Dockerfile` and `docker-compose.yml` are provided at the repo root. The
image uses the system `chromium` package rather than Puppeteer's bundled
download, since Chrome for Testing has no official `linux-arm64` build —
that keeps the same image working on both x86_64 and ARM (Raspberry Pi)
hosts.

## 1. Configure and start

```bash
cp .env.example .env
$EDITOR .env   # set GATEWAY_TOKEN
docker compose up -d --build
```

`docker-compose.yml` maps port `3141`, mounts `./data` into the container as
`/app/data` (session storage — see step 2), and gives Chromium a larger
`/dev/shm` than Docker's 64 MB default to avoid crashes. The container will
start up unauthenticated at this point — that's expected, `GET /health`
will show `authenticated: false` until step 2.

## 2. Log in and import the session

2FA needs a visible browser window, which the headless container doesn't
have. `npm run login:remote` handles this without any manual file copying:
it opens a Chromium window **on your own machine** for you to complete login
+ 2FA, then pushes the resulting session straight to the server's
`POST /auth/import` over the network.

```bash
npm run login:remote -- --server http://<server-ip>:3141 --token <your-token>
```

From here on, the silent-refresh mechanism keeps the session warm on the
server without a display. When it eventually fails (the underlying Auth0
cookie expired — see [Monitoring](#monitoring)), just rerun this command.

`/auth/import` is the one `/auth/*` route that stays behind `--token` even
when the rest of `/auth` doesn't need it — it lets a caller inject a fully
authenticated session, so it can't be left open.

<details>
<summary>Alternative: copy session.json by hand</summary>

If your machine can't reach the server's port over the network yet (e.g.
before a VPN is set up), you can still transfer the session file directly
instead:

```bash
npm run dev   # complete login + 2FA in the browser window that opens
mkdir -p data
cp session.json data/session.json   # on the server, into the compose data/ dir
```

It must go into the `data/` directory (not a single-file mount) — that's
also where the container persists refreshed sessions back to, and a
single-file bind mount would break that (see the comment in `Dockerfile`).

</details>

## 3. Remote access via VPN, not a public port

For access away from home, put the host on a VPN (e.g.
[Tailscale](https://tailscale.com) or WireGuard) and bind the published port
to that VPN interface instead of exposing it to the public internet, e.g. in
`docker-compose.yml`:

```yaml
ports:
  - '100.x.y.z:3141:3141'
```

`GATEWAY_TOKEN` (set in `.env`) is what protects the API once it's reachable
beyond `localhost` — don't skip it.

## 4. Updating

```bash
git pull
docker compose up -d --build
```

No CI/CD needed for a single-user deployment.

## Monitoring

`GET /health` reports both liveness and session freshness, so a single curl
tells you if the silent-refresh is still working (also wired up as the
container's `HEALTHCHECK`):

```bash
curl http://100.x.y.z:3141/health
# {"status":"ok","authenticated":true,"expiresAt":1735689600000}
```

If `authenticated` is `false` (or `expiresAt` is soon), the Auth0 cookie
behind the session has expired and silent refresh can no longer recover it —
repeat [step 2](#2-log-in-and-import-the-session).
