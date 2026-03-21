import type { Page } from 'puppeteer';
import type { Cookie } from '../types.ts';

export async function extractPersonIdFromCookies(page: Page): Promise<string> {
  const cookies = await page.cookies();
  const sessionCookie = cookies.find((c) => c.name === 'session');
  if (!sessionCookie) throw new Error('[identity] No "session" cookie found.');

  const parsed = JSON.parse(decodeURIComponent(sessionCookie.value)) as unknown;
  const userId = (parsed as { user?: { userId?: string } })?.user?.userId;
  if (!userId) throw new Error('[identity] Could not extract userId from session cookie.');
  return userId;
}

export async function extractAccountIds(
  page: Page,
): Promise<{ portfolioId: string; savingsId: string | null }> {
  let portfolioId: string | null = null;
  let savingsId: string | null = null;

  const hrefs = await page.evaluate((): string[] =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? ''),
  );

  for (const href of hrefs) {
    if (!portfolioId) {
      const m = href.match(/portfolioId=([^&]+)/);
      if (m?.[1]) portfolioId = m[1];
    }
    if (!savingsId) {
      const m = href.match(/\/interest\/([^/?]+)/);
      if (m?.[1]) savingsId = m[1];
    }
    if (portfolioId && savingsId) break;
  }

  if (!portfolioId) throw new Error('[identity] Could not extract portfolioId from cockpit page.');
  return { portfolioId, savingsId };
}

export async function extractCookies(page: Page): Promise<Cookie[]> {
  const puppeteerCookies = await page.cookies();
  return puppeteerCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure,
    sameSite: c.sameSite as Cookie['sameSite'],
  }));
}
