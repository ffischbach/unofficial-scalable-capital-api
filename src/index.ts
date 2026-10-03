import { parseArgs } from 'node:util';
import { loadSessionFromDisk } from './auth/session.ts';
import { configureBrowserProfile } from './auth/puppeteer-login.ts';
import { startAutoRefresh } from './auth/auto-refresh.ts';
import { createApp } from './server/app.ts';
import { setMonitorEnabled } from './scalable/apiMonitor.ts';
import type { GatewayConfig } from './types.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3141' },
    host: { type: 'string', default: '127.0.0.1' },
    token: { type: 'string' },
    monitor: { type: 'boolean', default: false },
    'browser-profile': { type: 'string' },
  },
});

const port = parseInt(values.port as string, 10);
const host = values.host as string;
const token = values.token as string | undefined;
const monitor = values.monitor as boolean;
const browserProfileDir = values['browser-profile'] as string | undefined;

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

if (host !== '127.0.0.1' && host !== 'localhost' && !token) {
  console.warn(
    `[server] Warning: binding to ${host} without --token. Anyone who can reach this address can read your portfolio data. Pass --token to protect it.`,
  );
}

const config: GatewayConfig = { port, host, token, browserProfileDir };

configureBrowserProfile(browserProfileDir);
setMonitorEnabled(monitor);

// Load persisted session before starting server (valid in ESM + Node 22+)
await loadSessionFromDisk();

const autoRefreshTimer = startAutoRefresh();

const app = createApp(config);

const server = app.listen(port, host, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Unofficial Scalable Capital API Gateway         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Listening on http://${host}:${port}`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Endpoints: http://${host}:${port}/docs`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  if (token) {
    console.log(`  Gateway token protection enabled (X-Gateway-Token header required)`);
    console.log('');
  }
  if (browserProfileDir) {
    console.log(`  Browser profile: ${browserProfileDir} (persistent login enabled)`);
    console.log('');
  }
  if (monitor) {
    console.log(`  API monitor enabled — changes written to api-changes.json`);
    console.log(`  Run 'npm run report-changes' to file GitHub issues for detected changes`);
    console.log('');
  }
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Use --port to specify a different port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);
  clearInterval(autoRefreshTimer);
  server.close(() => {
    console.log('[server] Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
