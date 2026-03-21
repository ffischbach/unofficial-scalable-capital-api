import { describe, it, expect } from 'vitest';
import { isSessionValid, createSession } from './session.ts';
import type { Cookie } from '../types.ts';

const mockCookies: Cookie[] = [{
  name: 'sid',
  value: 'abc123',
  domain: 'de.scalable.capital',
  path: '/',
  expires: -1,
  httpOnly: true,
  secure: true,
}];

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
