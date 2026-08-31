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

vi.mock('../../scalable/client.ts', () => ({
  ensureSilentRefresh: vi.fn(),
}));

import { getSession, isSessionValid, clearSession } from '../../auth/session.ts';
import { runPuppeteerLogin } from '../../auth/puppeteer-login.ts';
import { ensureSilentRefresh } from '../../scalable/client.ts';
import router from './auth.ts';

const mockGetSession = vi.mocked(getSession);
const mockIsSessionValid = vi.mocked(isSessionValid);
const mockClearSession = vi.mocked(clearSession);
const mockRunPuppeteerLogin = vi.mocked(runPuppeteerLogin);
const mockEnsureSilentRefresh = vi.mocked(ensureSilentRefresh);

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
// POST /refresh
// ---------------------------------------------------------------------------

describe('POST /refresh', () => {
  it('returns 400 when there is no session', async () => {
    mockGetSession.mockReturnValue(null);

    const res = await fetch(`${ctx.baseUrl}/refresh`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no session/i);
    expect(mockEnsureSilentRefresh).not.toHaveBeenCalled();
  });

  it('returns 401 when silent refresh fails', async () => {
    mockGetSession.mockReturnValue(makeMockSession());
    mockEnsureSilentRefresh.mockResolvedValue(false);

    const res = await fetch(`${ctx.baseUrl}/refresh`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/silent refresh failed/i);
  });

  it('returns the refreshed session on success', async () => {
    const existing = makeMockSession();
    const refreshed = makeMockSession({ expiresAt: Date.now() + 999_999 });
    mockGetSession.mockReturnValueOnce(existing).mockReturnValueOnce(refreshed);
    mockEnsureSilentRefresh.mockResolvedValue(true);

    const res = await fetch(`${ctx.baseUrl}/refresh`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockEnsureSilentRefresh).toHaveBeenCalledOnce();
    expect(body.message).toMatch(/refreshed/i);
    expect(body.expiresAt).toBe(refreshed.expiresAt);
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
