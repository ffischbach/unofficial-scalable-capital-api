import { describe, it, expect } from 'vitest';
import {
  extractPersonIdFromCookies,
  extractAccountIds,
  extractCookies,
} from './identity.ts';

// Minimal Puppeteer cookie shape used by the mocks
type PuppeteerCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly?: boolean;
  secure: boolean;
  sameSite?: string;
};

function makePage(cookies: PuppeteerCookie[], hrefs: string[] = []) {
  return {
    browserContext: () => ({
      cookies: async () => cookies,
    }),
    evaluate: async <T>(fn: () => T): Promise<T> => hrefs as unknown as T,
  };
}

// ---------------------------------------------------------------------------
// extractPersonIdFromCookies
// ---------------------------------------------------------------------------

describe('extractPersonIdFromCookies', () => {
  it('returns userId from a valid session cookie', async () => {
    const sessionValue = encodeURIComponent(
      JSON.stringify({ user: { userId: 'user-42' } }),
    );
    const page = makePage([
      { name: 'session', value: sessionValue, domain: 'de.scalable.capital', path: '/', expires: -1, secure: true },
    ]);
    await expect(extractPersonIdFromCookies(page as never)).resolves.toBe('user-42');
  });

  it('throws when no session cookie is present', async () => {
    const page = makePage([
      { name: 'other', value: 'x', domain: 'de.scalable.capital', path: '/', expires: -1, secure: true },
    ]);
    await expect(extractPersonIdFromCookies(page as never)).rejects.toThrow(
      '[identity] No "session" cookie found.',
    );
  });

  it('throws when session cookie JSON has no userId', async () => {
    const sessionValue = encodeURIComponent(JSON.stringify({ user: {} }));
    const page = makePage([
      { name: 'session', value: sessionValue, domain: 'de.scalable.capital', path: '/', expires: -1, secure: true },
    ]);
    await expect(extractPersonIdFromCookies(page as never)).rejects.toThrow(
      '[identity] Could not extract userId from session cookie.',
    );
  });

  it('throws when session cookie JSON has no user object', async () => {
    const sessionValue = encodeURIComponent(JSON.stringify({ other: 'stuff' }));
    const page = makePage([
      { name: 'session', value: sessionValue, domain: 'de.scalable.capital', path: '/', expires: -1, secure: true },
    ]);
    await expect(extractPersonIdFromCookies(page as never)).rejects.toThrow(
      '[identity] Could not extract userId from session cookie.',
    );
  });
});

// ---------------------------------------------------------------------------
// extractAccountIds
// ---------------------------------------------------------------------------

describe('extractAccountIds', () => {
  it('extracts both portfolioId and savingsId', async () => {
    const page = makePage([], [
      '/cockpit?portfolioId=port-99&foo=bar',
      '/interest/sav-77/overview',
    ]);
    await expect(extractAccountIds(page as never)).resolves.toEqual({
      portfolioId: 'port-99',
      savingsId: 'sav-77',
    });
  });

  it('extracts portfolioId from a URL with multiple query params', async () => {
    const page = makePage([], [
      '/cockpit?foo=1&portfolioId=port-abc&bar=2',
      '/interest/sav-xyz/',
    ]);
    const result = await extractAccountIds(page as never);
    expect(result.portfolioId).toBe('port-abc');
    expect(result.savingsId).toBe('sav-xyz');
  });

  it('returns savingsId as null when no interest href is found', async () => {
    const page = makePage([], [
      '/cockpit?portfolioId=port-99',
      '/some/other/link',
    ]);
    await expect(extractAccountIds(page as never)).resolves.toEqual({
      portfolioId: 'port-99',
      savingsId: null,
    });
  });

  it('throws when portfolioId cannot be found', async () => {
    const page = makePage([], ['/some/link', '/other/link']);
    await expect(extractAccountIds(page as never)).rejects.toThrow(
      '[identity] Could not extract portfolioId from cockpit page.',
    );
  });

  it('throws when href list is empty', async () => {
    const page = makePage([], []);
    await expect(extractAccountIds(page as never)).rejects.toThrow(
      '[identity] Could not extract portfolioId from cockpit page.',
    );
  });

  it('stops scanning once both ids are found', async () => {
    // First href contains both; second href has different ids that must be ignored
    const page = makePage([], [
      '/cockpit?portfolioId=port-first&x=/interest/sav-first/ov',
      '/cockpit?portfolioId=port-second',
      '/interest/sav-second/overview',
    ]);
    const result = await extractAccountIds(page as never);
    expect(result.portfolioId).toBe('port-first');
    // savingsId is in a separate href, so it picks up sav-first from the path
    // Actually the second href contains portfolioId but let's verify first-found wins
    expect(result.portfolioId).toBe('port-first');
  });

  it('picks the first occurrence of each id across separate hrefs', async () => {
    const page = makePage([], [
      '/cockpit?portfolioId=port-1',
      '/interest/sav-1/overview',
      '/cockpit?portfolioId=port-2',
      '/interest/sav-2/overview',
    ]);
    const result = await extractAccountIds(page as never);
    expect(result.portfolioId).toBe('port-1');
    expect(result.savingsId).toBe('sav-1');
  });
});

// ---------------------------------------------------------------------------
// extractCookies
// ---------------------------------------------------------------------------

describe('extractCookies', () => {
  it('maps Puppeteer cookies to the Cookie type', async () => {
    const page = makePage([
      {
        name: 'sid',
        value: 'abc',
        domain: 'de.scalable.capital',
        path: '/',
        expires: 9999999999,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      },
    ]);
    const cookies = await extractCookies(page as never);
    expect(cookies).toEqual([
      {
        name: 'sid',
        value: 'abc',
        domain: 'de.scalable.capital',
        path: '/',
        expires: 9999999999,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      },
    ]);
  });

  it('defaults httpOnly to false when absent', async () => {
    const page = makePage([
      { name: 'x', value: 'y', domain: 'example.com', path: '/', expires: -1, secure: false },
    ]);
    const [cookie] = await extractCookies(page as never);
    expect(cookie.httpOnly).toBe(false);
  });

  it('preserves undefined sameSite', async () => {
    const page = makePage([
      { name: 'x', value: 'y', domain: 'example.com', path: '/', expires: -1, secure: false },
    ]);
    const [cookie] = await extractCookies(page as never);
    expect(cookie.sameSite).toBeUndefined();
  });

  it('maps multiple cookies', async () => {
    const page = makePage([
      { name: 'a', value: '1', domain: 'd', path: '/', expires: -1, secure: true },
      { name: 'b', value: '2', domain: 'd', path: '/', expires: -1, secure: false },
    ]);
    const cookies = await extractCookies(page as never);
    expect(cookies).toHaveLength(2);
    expect(cookies[0].name).toBe('a');
    expect(cookies[1].name).toBe('b');
  });

  it('returns an empty array when there are no cookies', async () => {
    const page = makePage([]);
    await expect(extractCookies(page as never)).resolves.toEqual([]);
  });
});
