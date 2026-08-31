import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../types.ts';

vi.mock('puppeteer', () => ({ default: { launch: vi.fn() } }));
vi.mock('./identity.ts', () => ({
  extractPersonIdFromCookies: vi.fn(),
  extractAccountIds: vi.fn(),
  extractCookies: vi.fn(),
}));
vi.mock('./session.ts', () => ({ createSession: vi.fn() }));

import puppeteer from 'puppeteer';
import { extractPersonIdFromCookies, extractAccountIds, extractCookies } from './identity.ts';
import { createSession } from './session.ts';
import { attemptSilentRefresh } from './silent-refresh.ts';

const baseSession: Session = {
  cookies: [
    {
      name: 'sid',
      value: 'abc',
      domain: 'de.scalable.capital',
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: true,
    },
  ],
  personId: 'p',
  portfolioId: 'q',
  savingsId: null,
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

function makeMockPage(url: string) {
  return {
    setCookie: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue(url),
  };
}

function makeMockBrowser(page: ReturnType<typeof makeMockPage>) {
  return {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('attemptSilentRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null (does not throw) when puppeteer.launch fails', async () => {
    vi.mocked(puppeteer.launch).mockRejectedValue(new Error('Chrome binary not found'));

    await expect(attemptSilentRefresh(baseSession)).resolves.toBeNull();
  });

  it('returns null when navigation does not land on /cockpit', async () => {
    const page = makeMockPage('https://de.scalable.capital/en/secure-login');
    const browser = makeMockBrowser(page);
    vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);

    const result = await attemptSilentRefresh(baseSession);

    expect(result).toBeNull();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('returns the new session on success and closes the browser', async () => {
    const page = makeMockPage('https://de.scalable.capital/cockpit/');
    const browser = makeMockBrowser(page);
    vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
    vi.mocked(extractAccountIds).mockResolvedValue({ portfolioId: 'port1', savingsId: 'sav1' });
    vi.mocked(extractPersonIdFromCookies).mockResolvedValue('person1');
    vi.mocked(extractCookies).mockResolvedValue(baseSession.cookies);
    const newSession = { ...baseSession, expiresAt: Date.now() + 999_999 };
    vi.mocked(createSession).mockReturnValue(newSession);

    const result = await attemptSilentRefresh(baseSession);

    expect(result).toBe(newSession);
    expect(createSession).toHaveBeenCalledWith(baseSession.cookies, 'person1', 'port1', 'sav1');
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it('returns null when browser.close itself throws during cleanup', async () => {
    const page = makeMockPage('https://de.scalable.capital/cockpit/');
    const browser = makeMockBrowser(page);
    browser.close.mockRejectedValue(new Error('close failed'));
    vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);
    vi.mocked(extractAccountIds).mockResolvedValue({ portfolioId: 'port1', savingsId: null });
    vi.mocked(extractPersonIdFromCookies).mockResolvedValue('person1');
    vi.mocked(extractCookies).mockResolvedValue(baseSession.cookies);
    const newSession = { ...baseSession };
    vi.mocked(createSession).mockReturnValue(newSession);

    await expect(attemptSilentRefresh(baseSession)).resolves.toBe(newSession);
  });
});
