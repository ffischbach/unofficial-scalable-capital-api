import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Session } from '../types.ts';

vi.mock('./session.ts', () => ({
  getSession: vi.fn(),
}));
vi.mock('../scalable/client.ts', () => ({ ensureSilentRefresh: vi.fn() }));

import { getSession } from './session.ts';
import { ensureSilentRefresh } from '../scalable/client.ts';
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

    expect(ensureSilentRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh when session has more than 2h left', async () => {
    vi.mocked(getSession).mockReturnValue(makeSession({ expiresAt: Date.now() + 3 * 60 * 60 * 1000 }));

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(ensureSilentRefresh).not.toHaveBeenCalled();
  });

  it('refreshes via ensureSilentRefresh when session has less than 2h left', async () => {
    const soon = makeSession({ expiresAt: Date.now() + 60 * 60 * 1000 });
    vi.mocked(getSession).mockReturnValue(soon);
    vi.mocked(ensureSilentRefresh).mockResolvedValue(true);

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(ensureSilentRefresh).toHaveBeenCalledOnce();
  });

  it('logs and does not throw when silent refresh fails', async () => {
    const soon = makeSession({ expiresAt: Date.now() + 60 * 60 * 1000 });
    vi.mocked(getSession).mockReturnValue(soon);
    vi.mocked(ensureSilentRefresh).mockResolvedValue(false);

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // must not throw / reject unhandled
  });

  it('does not throw when ensureSilentRefresh rejects unexpectedly', async () => {
    const soon = makeSession({ expiresAt: Date.now() + 60 * 60 * 1000 });
    vi.mocked(getSession).mockReturnValue(soon);
    vi.mocked(ensureSilentRefresh).mockRejectedValue(new Error('puppeteer launch failed'));

    startAutoRefresh();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // must not throw / reject unhandled
  });
});
