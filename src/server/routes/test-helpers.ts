import express from 'express';
import { createServer } from 'node:http';
import { beforeAll, afterAll } from 'vitest';
import type { Router } from 'express';
import type { AddressInfo } from 'node:net';
import type { Session } from '../../types.ts';

/**
 * Creates a mock session object. Called as a function so Date.now() is
 * evaluated fresh on each call (avoids stale timestamps in test fixtures).
 */
export function makeMockSession(overrides: Partial<Session> = {}): Session {
  return {
    cookies: [],
    personId: 'person-1',
    portfolioId: 'portfolio-1',
    savingsId: null,
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

/**
 * Mounts the given router under "/" on a real HTTP server bound to a random
 * port. Registers beforeAll / afterAll lifecycle hooks automatically.
 *
 * Returns a context object whose `baseUrl` property is populated once
 * beforeAll completes.
 */
export function setupRouteTest(router: Router): { baseUrl: string } {
  const ctx = { baseUrl: '' };
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const app = express();
    app.use('/', router);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    ctx.baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  return ctx;
}
