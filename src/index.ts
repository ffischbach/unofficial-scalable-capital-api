import { parseArgs } from 'node:util';
import { loadSessionFromDisk } from './auth/session.ts';
import { createApp } from './server/app.ts';
import type { GatewayConfig } from './types.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '3141' },
    token: { type: 'string' },
  },
});

const port = parseInt(values.port as string, 10);
const token = values.token as string | undefined;

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${values.port}`);
  process.exit(1);
}

const config: GatewayConfig = { port, token };

// Load persisted session before starting server (valid in ESM + Node 22+)
await loadSessionFromDisk();

const app = createApp(config);

const server = app.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    Unofficial Scalable Capital API Gateway        ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Listening on  http://127.0.0.1:${port}             ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                       ║');
  console.log('║    GET  /health                                   ║');
  console.log('║    GET  /auth/status                              ║');
  console.log('║    POST /auth/login                               ║');
  console.log('║    DEL  /auth/logout                              ║');
  console.log('║    POST /proxy                                    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  if (token) {
    console.log(`  Gateway token protection enabled (X-Gateway-Token header required)`);
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
