import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireSession } from './requireSession.ts';

vi.mock('../../auth/session.ts', () => ({
  getSession: vi.fn(),
  isSessionValid: vi.fn(),
}));

vi.mock('../../scalable/client.ts', () => ({
  ensureSilentRefresh: vi.fn(),
}));

import { getSession, isSessionValid } from '../../auth/session.ts';
import { ensureSilentRefresh } from '../../scalable/client.ts';

const mockGetSession = vi.mocked(getSession);
const mockIsSessionValid = vi.mocked(isSessionValid);
const mockEnsureSilentRefresh = vi.mocked(ensureSilentRefresh);

function makeMockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

const mockReq = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireSession', () => {
  it('responds 401 when getSession returns null', async () => {
    mockGetSession.mockReturnValue(null);
    const res = makeMockRes();
    const next = vi.fn();
    await requireSession(mockReq, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
    expect(mockEnsureSilentRefresh).not.toHaveBeenCalled();
  });

  it('calls next() when session is valid', async () => {
    mockGetSession.mockReturnValue({
      cookies: [],
      personId: '',
      portfolioId: '',
      savingsId: null,
      authenticatedAt: 0,
      expiresAt: Date.now() + 9999,
    });
    mockIsSessionValid.mockReturnValue(true);
    const res = makeMockRes();
    const next = vi.fn();
    await requireSession(mockReq, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockEnsureSilentRefresh).not.toHaveBeenCalled();
  });

  it('attempts a silent refresh when session exists but is expired, and calls next() on success', async () => {
    mockGetSession.mockReturnValue({
      cookies: [],
      personId: '',
      portfolioId: '',
      savingsId: null,
      authenticatedAt: 0,
      expiresAt: 0,
    });
    mockIsSessionValid.mockReturnValue(false);
    mockEnsureSilentRefresh.mockResolvedValue(true);
    const res = makeMockRes();
    const next = vi.fn();
    await requireSession(mockReq, res as never, next);
    expect(mockEnsureSilentRefresh).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 401 when session exists but is expired and silent refresh fails', async () => {
    mockGetSession.mockReturnValue({
      cookies: [],
      personId: '',
      portfolioId: '',
      savingsId: null,
      authenticatedAt: 0,
      expiresAt: 0,
    });
    mockIsSessionValid.mockReturnValue(false);
    mockEnsureSilentRefresh.mockResolvedValue(false);
    const res = makeMockRes();
    const next = vi.fn();
    await requireSession(mockReq, res as never, next);
    expect(mockEnsureSilentRefresh).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
