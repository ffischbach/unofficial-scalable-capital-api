import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockSession, setupRouteTest } from './test-helpers.ts';

vi.mock('../../auth/session.ts', () => ({
  getSession: vi.fn(),
  isSessionValid: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('../../auth/puppeteer-login.ts', () => ({
  runPuppeteerLogin: vi.fn(),
}));

import { getSession, isSessionValid, clearSession } from '../../auth/session.ts';
import { runPuppeteerLogin } from '../../auth/puppeteer-login.ts';
import router from './auth.ts';

const mockGetSession = vi.mocked(getSession);
const mockIsSessionValid = vi.mocked(isSessionValid);
const mockClearSession = vi.mocked(clearSession);
const mockRunPuppeteerLogin = vi.mocked(runPuppeteerLogin);

const ctx = setupRouteTest(router);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------

describe('POST /login', () => {
  it('returns 200 with already-authenticated message when session is valid', async () => {
    const session = makeMockSession({ savingsId: 'sav-1' });
    mockGetSession.mockReturnValue(session);
    mockIsSessionValid.mockReturnValue(true);

    const res = await fetch(`${ctx.baseUrl}/login`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toMatch(/already authenticated/i);
    expect(body.personId).toBe(session.personId);
    expect(body.portfolioId).toBe(session.portfolioId);
    expect(body.savingsId).toBe(session.savingsId);
    expect(mockRunPuppeteerLogin).not.toHaveBeenCalled();
  });

  it('calls runPuppeteerLogin when there is no existing session', async () => {
    mockGetSession.mockReturnValue(null);
    const newSession = makeMockSession({ savingsId: null });
    mockRunPuppeteerLogin.mockResolvedValue(newSession);

    const res = await fetch(`${ctx.baseUrl}/login`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRunPuppeteerLogin).toHaveBeenCalledOnce();
    expect(body.message).toMatch(/login successful/i);
    expect(body.personId).toBe(newSession.personId);
  });

  it('calls runPuppeteerLogin when the existing session is expired', async () => {
    mockGetSession.mockReturnValue(makeMockSession());
    mockIsSessionValid.mockReturnValue(false);
    const newSession = makeMockSession();
    mockRunPuppeteerLogin.mockResolvedValue(newSession);

    const res = await fetch(`${ctx.baseUrl}/login`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockRunPuppeteerLogin).toHaveBeenCalledOnce();
    expect(body.message).toMatch(/login successful/i);
  });
});

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

describe('GET /status', () => {
  it('returns authenticated: false when there is no session', async () => {
    mockGetSession.mockReturnValue(null);

    const res = await fetch(`${ctx.baseUrl}/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
  });

  it('returns authenticated: false when the session is expired', async () => {
    mockGetSession.mockReturnValue(makeMockSession());
    mockIsSessionValid.mockReturnValue(false);

    const res = await fetch(`${ctx.baseUrl}/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ authenticated: false });
  });

  it('returns authenticated: true with session details when valid', async () => {
    const session = makeMockSession({ savingsId: 'sav-42' });
    mockGetSession.mockReturnValue(session);
    mockIsSessionValid.mockReturnValue(true);

    const res = await fetch(`${ctx.baseUrl}/status`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.personId).toBe(session.personId);
    expect(body.portfolioId).toBe(session.portfolioId);
    expect(body.savingsId).toBe(session.savingsId);
    expect(body.expiresAt).toBe(session.expiresAt);
  });
});

// ---------------------------------------------------------------------------
// DELETE /logout
// ---------------------------------------------------------------------------

describe('DELETE /logout', () => {
  it('calls clearSession and returns logout message', async () => {
    mockClearSession.mockResolvedValue(undefined);

    const res = await fetch(`${ctx.baseUrl}/logout`, { method: 'DELETE' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockClearSession).toHaveBeenCalledOnce();
    expect(body.message).toMatch(/logged out/i);
  });
});
