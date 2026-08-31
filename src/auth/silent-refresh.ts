import puppeteer, { type Browser, type CookieParam } from 'puppeteer';
import { extractPersonIdFromCookies, extractAccountIds, extractCookies } from './identity.ts';
import { createSession } from './session.ts';
import type { Cookie, Session } from '../types.ts';

const SILENT_REFRESH_TIMEOUT_MS = 30_000;

function toCookieParam(cookie: Cookie): CookieParam {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    ...(cookie.expires > 0 ? { expires: cookie.expires } : {}),
  };
}

export async function attemptSilentRefresh(session: Session): Promise<Session | null> {
  console.log('[silent-refresh] Attempting silent session refresh...');
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setCookie(...session.cookies.map(toCookieParam));

    await page.goto('https://de.scalable.capital/cockpit/', {
      waitUntil: 'networkidle2',
      timeout: SILENT_REFRESH_TIMEOUT_MS,
    });

    if (!page.url().includes('/cockpit')) {
      console.log('[silent-refresh] Not on cockpit after navigation — silent refresh failed.');
      return null;
    }

    const { portfolioId, savingsId } = await extractAccountIds(page);
    const personId = await extractPersonIdFromCookies(page);
    const cookies = await extractCookies(page);

    console.log('[silent-refresh] Silent refresh succeeded.');
    return createSession(cookies, personId, portfolioId, savingsId);
  } catch (err) {
    console.warn('[silent-refresh] Silent refresh failed:', err);
    return null;
  } finally {
    try {
      await browser?.close();
    } catch (err) {
      console.warn('[silent-refresh] Failed to close headless browser:', err);
    }
  }
}
