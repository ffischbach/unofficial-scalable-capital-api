import { parseArgs } from 'node:util';
import { loadSessionFromDisk } from './auth/session.ts';
import { createApp } from './server/app.ts';
import { setMonitorEnabled } from './scalable/apiMonitor.ts';
import type { GatewayConfig } from './types.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3141' },
    token: { type: 'string' },
    monitor: { type: 'boolean', default: false },
  },
});

const port = parseInt(values.port as string, 10);
const token = values.token as string | undefined;
const monitor = values.monitor as boolean;

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

const config: GatewayConfig = { port, token };

setMonitorEnabled(monitor);

// Load persisted session before starting server (valid in ESM + Node 22+)
await loadSessionFromDisk();

const app = createApp(config);

const server = app.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Unofficial Scalable Capital API Gateway         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Listening on http://127.0.0.1:${port}              ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Endpoints: http://127.0.0.1:${port}/docs           ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  if (token) {
    console.log(`  Gateway token protection enabled (X-Gateway-Token header required)`);
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
  server.close(() => {
    console.log('[server] Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
