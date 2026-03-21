import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireSession } from './requireSession.ts';

vi.mock('../../auth/session.ts', () => ({
  getSession: vi.fn(),
  isSessionValid: vi.fn(),
}));

import { getSession, isSessionValid } from '../../auth/session.ts';

const mockGetSession = vi.mocked(getSession);
const mockIsSessionValid = vi.mocked(isSessionValid);

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
  it('responds 401 when getSession returns null', () => {
    mockGetSession.mockReturnValue(null);
    const res = makeMockRes();
    const next = vi.fn();
    requireSession(mockReq, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 when session exists but isSessionValid returns false', () => {
    mockGetSession.mockReturnValue({ cookies: [], personId: '', portfolioId: '', savingsId: null, authenticatedAt: 0, expiresAt: 0 });
    mockIsSessionValid.mockReturnValue(false);
    const res = makeMockRes();
    const next = vi.fn();
    requireSession(mockReq, res as never, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when session is valid', () => {
    mockGetSession.mockReturnValue({ cookies: [], personId: '', portfolioId: '', savingsId: null, authenticatedAt: 0, expiresAt: Date.now() + 9999 });
    mockIsSessionValid.mockReturnValue(true);
    const res = makeMockRes();
    const next = vi.fn();
    requireSession(mockReq, res as never, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
