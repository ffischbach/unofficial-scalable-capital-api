import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSessionValid, createSession, loadSessionFromDisk, persistSession, clearSession, getSession } from './session.ts';
import type { Cookie, Session } from '../types.ts';
import fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const mockCookies: Cookie[] = [
  {
    name: 'sid',
    value: 'abc123',
    domain: 'de.scalable.capital',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
  },
];

describe('isSessionValid', () => {
  it('returns true when expiresAt is in the future', () => {
    const session = createSession(mockCookies, 'pid', 'portId', null);
    expect(isSessionValid(session)).toBe(true);
  });

  it('returns false when expiresAt is in the past', () => {
    const session = createSession(mockCookies, 'pid', 'portId', null);
    const expired = { ...session, expiresAt: Date.now() - 1 };
    expect(isSessionValid(expired)).toBe(false);
  });

  it('returns false when expiresAt equals Date.now() (not strictly less-than)', () => {
    const now = Date.now();
    const session = createSession(mockCookies, 'pid', 'portId', null);
    const atEdge = { ...session, expiresAt: now };
    // Date.now() will have advanced by tiny amount, so expiresAt <= Date.now()
    expect(isSessionValid(atEdge)).toBe(false);
  });
});

describe('createSession', () => {
  it('returns an object with all required fields', () => {
    const session = createSession(mockCookies, 'person1', 'port1', null);
    expect(session).toMatchObject({
      cookies: mockCookies,
      personId: 'person1',
      portfolioId: 'port1',
    });
    expect(typeof session.authenticatedAt).toBe('number');
    expect(typeof session.expiresAt).toBe('number');
  });

  it('sets expiresAt to 8 hours when all cookies are session cookies (expires: -1)', () => {
    const before = Date.now();
    const session = createSession(mockCookies, 'p', 'q', null);
    const after = Date.now();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + eightHoursMs - 100);
    expect(session.expiresAt).toBeLessThanOrEqual(after + eightHoursMs + 100);
  });

  it('uses the earliest cookie expiry when it is sooner than 8 hours', () => {
    const soon = Math.floor((Date.now() + 30 * 60 * 1000) / 1000); // 30 min from now in Unix s
    const cookiesWithExpiry: Cookie[] = [{ ...mockCookies[0], expires: soon }];
    const session = createSession(cookiesWithExpiry, 'p', 'q', null);
    expect(session.expiresAt).toBe(soon * 1000);
  });

  it('caps at 8 hours even when cookie expiry is farther in the future', () => {
    const far = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days
    const cookiesWithExpiry: Cookie[] = [{ ...mockCookies[0], expires: far }];
    const before = Date.now();
    const session = createSession(cookiesWithExpiry, 'p', 'q', null);
    const after = Date.now();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + eightHoursMs - 100);
    expect(session.expiresAt).toBeLessThanOrEqual(after + eightHoursMs + 100);
  });
});

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

function makeValidSession(): Session {
  return {
    cookies: [
      {
        name: 'sid',
        value: 'abc123',
        domain: 'de.scalable.capital',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: true,
      },
    ],
    personId: 'person1',
    portfolioId: 'port1',
    savingsId: null,
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  };
}

// ---------------------------------------------------------------------------
// loadSessionFromDisk
// ---------------------------------------------------------------------------

describe('loadSessionFromDisk', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module-level currentSession to null between tests
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    await clearSession();
  });

  it('sets currentSession when the file contains a valid unexpired session', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(makeValidSession()) as never);
    await loadSessionFromDisk();
    expect(getSession()).toMatchObject({ personId: 'person1', portfolioId: 'port1' });
  });

  it('does not set currentSession when the session is expired', async () => {
    const expired = { ...makeValidSession(), expiresAt: Date.now() - 1 };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(expired) as never);
    await loadSessionFromDisk();
    expect(getSession()).toBeNull();
  });

  it('does not set currentSession when Zod validation fails', async () => {
    const invalid = { cookies: [], personId: 'p' }; // missing required fields
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalid) as never);
    await loadSessionFromDisk();
    expect(getSession()).toBeNull();
  });

  it('does not set currentSession when the file contains malformed JSON', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('not-json' as never);
    await loadSessionFromDisk();
    expect(getSession()).toBeNull();
  });

  it('does not throw and leaves currentSession null when file does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('no file'), { code: 'ENOENT' });
    vi.mocked(fs.readFile).mockRejectedValue(err);
    await expect(loadSessionFromDisk()).resolves.toBeUndefined();
    expect(getSession()).toBeNull();
  });

  it('does not throw on other read errors', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('disk failure'));
    await expect(loadSessionFromDisk()).resolves.toBeUndefined();
    expect(getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// persistSession
// ---------------------------------------------------------------------------

describe('persistSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes session JSON to a .tmp file with mode 0o600', async () => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await persistSession(makeValidSession());

    expect(fs.writeFile).toHaveBeenCalledOnce();
    const [tmpPath, content, opts] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string, { mode: number }];
    expect(tmpPath).toMatch(/session\.json\.[0-9a-f-]+\.tmp$/);
    expect(() => JSON.parse(content)).not.toThrow();
    expect(opts).toMatchObject({ mode: 0o600 });
  });

  it('atomically renames the tmp file to session.json', async () => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await persistSession(makeValidSession());

    expect(fs.rename).toHaveBeenCalledOnce();
    const [from, to] = vi.mocked(fs.rename).mock.calls[0] as [string, string];
    expect(from).toMatch(/\.tmp$/);
    expect(to).toMatch(/session\.json$/);
    expect(to).not.toMatch(/\.tmp$/);
  });

  it('tmp path used in writeFile matches the source path used in rename', async () => {
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockResolvedValue(undefined);

    await persistSession(makeValidSession());

    const [writtenPath] = vi.mocked(fs.writeFile).mock.calls[0] as [string, ...unknown[]];
    const [renamedFrom] = vi.mocked(fs.rename).mock.calls[0] as [string, string];
    expect(writtenPath).toBe(renamedFrom);
  });

  it('cleans up the tmp file and rethrows when writeFile fails', async () => {
    const writeErr = new Error('disk full');
    vi.mocked(fs.writeFile).mockRejectedValue(writeErr);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await expect(persistSession(makeValidSession())).rejects.toThrow('disk full');

    expect(fs.rename).not.toHaveBeenCalled();
    expect(fs.unlink).toHaveBeenCalledOnce();
    const [unlinkedPath] = vi.mocked(fs.unlink).mock.calls[0] as [string];
    expect(unlinkedPath).toMatch(/\.tmp$/);
  });

  it('cleans up the tmp file and rethrows when rename fails', async () => {
    const renameErr = new Error('rename failed');
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.rename).mockRejectedValue(renameErr);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await expect(persistSession(makeValidSession())).rejects.toThrow('rename failed');

    expect(fs.unlink).toHaveBeenCalledOnce();
    const [unlinkedPath] = vi.mocked(fs.unlink).mock.calls[0] as [string];
    expect(unlinkedPath).toMatch(/\.tmp$/);
  });

  it('does not throw if tmp file cleanup itself fails during error handling', async () => {
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('write error'));
    vi.mocked(fs.unlink).mockRejectedValue(new Error('unlink error'));

    await expect(persistSession(makeValidSession())).rejects.toThrow('write error');
  });
});
