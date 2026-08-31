import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from '../types.ts';

vi.mock('./session.ts', () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  persistSession: vi.fn(),
}));
vi.mock('./silent-refresh.ts', () => ({ attemptSilentRefresh: vi.fn() }));

import { getSession, setSession, persistSession } from './session.ts';
import { attemptSilentRefresh } from './silent-refresh.ts';
import { startAutoRefresh } from './auto-refresh.ts';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    cookies: [],
    personId: 'p',
    portfolioId: 'q',
    savingsId: null,
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('startAutoRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when there is no session', async () => {
    vi.mocked(getSession).mockReturnValue(null);

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(attemptSilentRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh when session has more than 2h left', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession({ expiresAt: Date.now() + 3 * 60 * 60 * 1000 }));

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(attemptSilentRefresh).not.toHaveBeenCalled();
  });

  it('refreshes and persists when session has less than 2h left', async () => {
    const soon = makeSession({ expiresAt: Date.now() + 60 * 60 * 1000 });
    const refreshed = makeSession({ expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    vi.mocked(getSession).mockReturnValue(soon);
    vi.mocked(attemptSilentRefresh).mockResolvedValue(refreshed);

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(attemptSilentRefresh).toHaveBeenCalledWith(soon);
    expect(setSession).toHaveBeenCalledWith(refreshed);
    expect(persistSession).toHaveBeenCalledWith(refreshed);
  });

  it('logs and does not throw when silent refresh fails', async () => {
    const soon = makeSession({ expiresAt: Date.now() + 60 * 60 * 1000 });
    vi.mocked(getSession).mockReturnValue(soon);
    vi.mocked(attemptSilentRefresh).mockResolvedValue(null);

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(setSession).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
  });
});
