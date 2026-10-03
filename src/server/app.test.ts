import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { makeMockSession } from './routes/test-helpers.ts';

vi.mock('../auth/session.ts', () => ({
  getSession: vi.fn(),
  isSessionValid: vi.fn(),
  setSession: vi.fn(),
  persistSession: vi.fn(),
}));

import { getSession, isSessionValid } from '../auth/session.ts';
import { createApp } from './app.ts';

const mockGetSession = vi.mocked(getSession);
const mockIsSessionValid = vi.mocked(isSessionValid);

let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const app = createApp({ port: 0, host: '127.0.0.1' });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /health', () => {
  it('reports authenticated: false with no expiresAt when there is no session', async () => {
    mockGetSession.mockReturnValue(null);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok', authenticated: false, expiresAt: null });
  });

  it('reports authenticated: false when the session is expired', async () => {
    mockGetSession.mockReturnValue(makeMockSession());
    mockIsSessionValid.mockReturnValue(false);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(body).toEqual({ status: 'ok', authenticated: false, expiresAt: null });
  });

  it('reports authenticated: true with expiresAt when the session is valid', async () => {
    const session = makeMockSession();
    mockGetSession.mockReturnValue(session);
    mockIsSessionValid.mockReturnValue(true);

    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(body).toEqual({ status: 'ok', authenticated: true, expiresAt: session.expiresAt });
  });

  it('is reachable without a gateway token', async () => {
    const app = createApp({ port: 0, host: '127.0.0.1', token: 'secret' });
    const tokenServer = createServer(app);
    await new Promise<void>((resolve) => tokenServer.listen(0, resolve));
    const port = (tokenServer.address() as AddressInfo).port;

    mockGetSession.mockReturnValue(null);
    const res = await fetch(`http://localhost:${port}/health`);

    expect(res.status).toBe(200);
    await new Promise<void>((resolve) => tokenServer.close(() => resolve()));
  });
});

describe('gateway token exemptions', () => {
  it('exempts /auth/status but requires the token for /auth/import', async () => {
    const app = createApp({ port: 0, host: '127.0.0.1', token: 'secret' });
    const tokenServer = createServer(app);
    await new Promise<void>((resolve) => tokenServer.listen(0, resolve));
    const port = (tokenServer.address() as AddressInfo).port;

    mockGetSession.mockReturnValue(null);

    const statusRes = await fetch(`http://localhost:${port}/auth/status`);
    expect(statusRes.status).toBe(200);

    const importRes = await fetch(`http://localhost:${port}/auth/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(importRes.status).toBe(401);

    await new Promise<void>((resolve) => tokenServer.close(() => resolve()));
  });
});
