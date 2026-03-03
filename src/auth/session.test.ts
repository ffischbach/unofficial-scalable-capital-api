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
    const session = createSession(mockCookies, 'pid', 'portId', '1000');
    expect(isSessionValid(session)).toBe(true);
  });

  it('returns false when expiresAt is in the past', () => {
    const session = createSession(mockCookies, 'pid', 'portId', '1000');
    const expired = { ...session, expiresAt: Date.now() - 1 };
    expect(isSessionValid(expired)).toBe(false);
  });

  it('returns false when expiresAt equals Date.now() (not strictly less-than)', () => {
    const now = Date.now();
    const session = createSession(mockCookies, 'pid', 'portId', '1000');
    const atEdge = { ...session, expiresAt: now };
    // Date.now() will have advanced by tiny amount, so expiresAt <= Date.now()
    expect(isSessionValid(atEdge)).toBe(false);
  });
});

describe('createSession', () => {
  it('returns an object with all required fields', () => {
    const session = createSession(mockCookies, 'person1', 'port1', '999.99');
    expect(session).toMatchObject({
      cookies: mockCookies,
      personId: 'person1',
      portfolioId: 'port1',
      valuation: '999.99',
    });
    expect(typeof session.authenticatedAt).toBe('number');
    expect(typeof session.expiresAt).toBe('number');
  });

  it('sets expiresAt approximately 8 hours in the future', () => {
    const before = Date.now();
    const session = createSession(mockCookies, 'p', 'q', '0');
    const after = Date.now();
    const eightHoursMs = 8 * 60 * 60 * 1000;
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + eightHoursMs - 100);
    expect(session.expiresAt).toBeLessThanOrEqual(after + eightHoursMs + 100);
  });
});
