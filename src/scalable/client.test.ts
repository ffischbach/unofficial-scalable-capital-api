import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCookieHeader, buildHeaders, AuthenticationError, graphqlRequest } from './client.ts';
import type { Cookie, Session, GraphQLRequest } from '../types.ts';
import { getSession, isSessionValid } from '../auth/session.ts';
import { runPuppeteerLogin } from '../auth/puppeteer-login.ts';

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

// ---------------------------------------------------------------------------
// graphqlRequest helpers
// ---------------------------------------------------------------------------

const baseSession: Session = {
  cookies: [makeCookie('sid', 'abc')],
  portfolioId: 'pid',
  personId: 'uid',
  savingsId: null,
  expiresAt: Date.now() + 60_000,
  authenticatedAt: Date.now(),
};

const body: GraphQLRequest = { query: '{ test }', operationName: 'TestOp', variables: {} };

function okFetch(data: unknown = {}) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) } as Response);
}

function errFetch(status: number) {
  return Promise.resolve({ ok: false, status, text: () => Promise.resolve('') } as Response);
}

// ---------------------------------------------------------------------------
// graphqlRequest — session guard
// ---------------------------------------------------------------------------

describe('graphqlRequest — no session', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws AuthenticationError when getSession returns null', async () => {
    vi.mocked(getSession).mockReturnValue(null);
    await expect(graphqlRequest(body)).rejects.toThrow(AuthenticationError);
  });
});

describe('graphqlRequest — expired session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockReturnValue(baseSession);
  });

  it('triggers re-login and retries when session is expired', async () => {
    vi.mocked(isSessionValid).mockReturnValueOnce(false).mockReturnValue(true);
    vi.mocked(runPuppeteerLogin).mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okFetch({ result: 'ok' })));

    const result = await graphqlRequest(body);

    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { result: 'ok' } });
  });

  it('throws "Session expired and re-login failed." when session is still invalid after re-login', async () => {
    vi.mocked(isSessionValid).mockReturnValue(false);
    vi.mocked(runPuppeteerLogin).mockResolvedValue(undefined);

    await expect(graphqlRequest(body)).rejects.toThrow('Session expired and re-login failed.');
    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// graphqlRequest — successful request
// ---------------------------------------------------------------------------

describe('graphqlRequest — success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockReturnValue(baseSession);
    vi.mocked(isSessionValid).mockReturnValue(true);
  });

  it('returns parsed JSON on a 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okFetch({ portfolio: 'x' })));
    const result = await graphqlRequest(body);
    expect(result).toEqual({ data: { portfolio: 'x' } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('POSTs to the Scalable Capital GraphQL URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okFetch()));
    await graphqlRequest(body);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://de.scalable.capital/broker/api/data');
    expect(init.method).toBe('POST');
  });

  it('serialises the request body as JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(okFetch()));
    await graphqlRequest(body);
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify(body));
  });
});

// ---------------------------------------------------------------------------
// graphqlRequest — auto-retry on 401/403
// ---------------------------------------------------------------------------

describe('graphqlRequest — auto-retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockReturnValue(baseSession);
    vi.mocked(isSessionValid).mockReturnValue(true);
    vi.mocked(runPuppeteerLogin).mockResolvedValue(undefined);
  });

  it('re-logs in and retries once on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(errFetch(401)).mockReturnValue(okFetch({ ok: true })),
    );

    const result = await graphqlRequest(body);

    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ data: { ok: true } });
  });

  it('re-logs in and retries once on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(errFetch(403)).mockReturnValue(okFetch({ ok: true })),
    );

    const result = await graphqlRequest(body);

    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { ok: true } });
  });

  it('does not retry a second time when 401 occurs on the retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(errFetch(401)));

    await expect(graphqlRequest(body)).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(runPuppeteerLogin).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(errFetch(500)));

    await expect(graphqlRequest(body)).rejects.toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runPuppeteerLogin).not.toHaveBeenCalled();
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
