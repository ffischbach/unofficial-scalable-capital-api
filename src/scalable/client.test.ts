import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCookieHeader, buildHeaders, AuthenticationError } from './client.ts';
import type { Cookie } from '../types.ts';

vi.mock('../auth/puppeteer-login.ts', () => ({ runPuppeteerLogin: vi.fn() }));
vi.mock('../auth/session.ts', () => ({ getSession: vi.fn(), isSessionValid: vi.fn() }));
vi.mock('./apiMonitor.ts', () => ({ checkResponseShape: vi.fn() }));

function makeCookie(name: string, value: string): Cookie {
  return {
    name,
    value,
    domain: 'de.scalable.capital',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
  };
}

describe('buildCookieHeader', () => {
  it('returns empty string for empty array', () => {
    expect(buildCookieHeader([])).toBe('');
  });

  it('formats a single cookie', () => {
    expect(buildCookieHeader([makeCookie('a', '1')])).toBe('a=1');
  });

  it('joins multiple cookies with "; "', () => {
    expect(buildCookieHeader([makeCookie('a', '1'), makeCookie('b', '2')])).toBe('a=1; b=2');
  });
});

describe('buildHeaders', () => {
  const headers = buildHeaders('pid', 'cookie=x');

  it('includes required keys', () => {
    expect(headers).toHaveProperty('Content-Type');
    expect(headers).toHaveProperty('Cookie');
    expect(headers).toHaveProperty('Referer');
    expect(headers).toHaveProperty('x-scacap-features-enabled');
    expect(headers).toHaveProperty('Origin');
  });

  it('sets Content-Type to application/json', () => {
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sets Cookie to the provided cookie header', () => {
    expect(headers['Cookie']).toBe('cookie=x');
  });

  it('includes portfolioId in Referer', () => {
    expect(headers['Referer']).toContain('portfolioId=pid');
  });

  it('sets correct x-scacap-features-enabled value', () => {
    expect(headers['x-scacap-features-enabled']).toBe('CRYPTO_MULTI_ETP,UNIQUE_SECURITY_ID');
  });
});

describe('AuthenticationError', () => {
  it('is an instance of Error', () => {
    expect(new AuthenticationError()).toBeInstanceOf(Error);
  });

  it('has name "AuthenticationError"', () => {
    expect(new AuthenticationError().name).toBe('AuthenticationError');
  });

  it('default message mentions POST /auth/login', () => {
    expect(new AuthenticationError().message).toContain('POST /auth/login');
  });

  it('accepts a custom message', () => {
    expect(new AuthenticationError('custom').message).toBe('custom');
  });
});

describe('graphqlRequest — login mutex', () => {
  const mockSession = {
    cookies: [makeCookie('sid', 'abc')],
    portfolioId: 'pid',
    personId: 'uid',
    savingsId: null,
    expiresAt: Date.now() + 60_000,
    authenticatedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only calls runPuppeteerLogin once when two requests hit 401 concurrently', async () => {
    const { runPuppeteerLogin } = await import('../auth/puppeteer-login.ts');
    const { getSession, isSessionValid } = await import('../auth/session.ts');
    const { graphqlRequest } = await import('./client.ts');

    vi.mocked(getSession).mockReturnValue(mockSession);
    vi.mocked(isSessionValid).mockReturnValue(true);

    // Slow login so the second concurrent 401 arrives while the first login is in-flight
    vi.mocked(runPuppeteerLogin).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );

    let fetchCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount <= 2) {
          // Both concurrent requests get a 401
          return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('') });
        }
        // Retries after login succeed
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
      }),
    );

    const body = { query: '{ test }', operationName: 'test', variables: {} };
    await Promise.all([graphqlRequest(body), graphqlRequest(body)]);

    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
  });
});
