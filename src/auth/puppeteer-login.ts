import puppeteer from 'puppeteer';
import { extractPersonIdFromCookies, extractAccountIds, extractCookies } from './identity.ts';
import { createSession, persistSession, setSession } from './session.ts';
import type { Session } from '../types.ts';

export async function runPuppeteerLogin(): Promise<Session> {
  console.log('[login] Launching browser for interactive login...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();

    // Step 1: Navigate to login page
    await page.goto('https://de.scalable.capital/en/secure-login', {
      waitUntil: 'domcontentloaded',
    });

    console.log('[login] Browser opened. Please complete login and 2FA (up to 2 minutes)...');

    // Step 2: Wait for user to complete login + 2FA
    await page.waitForFunction(() => !window.location.pathname.includes('secure-login'), {
      timeout: 120_000,
      polling: 500,
    });

    console.log(`[login] Login detected. Current URL: ${page.url()}`);

    // Step 3: Navigate to cockpit if not already there, then wait for account cards to render.
    if (!page.url().includes('/cockpit')) {
      await page.goto('https://de.scalable.capital/cockpit/', {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      });
      console.log(`[login] Navigated to cockpit. URL: ${page.url()}`);
    }

    await page
      .waitForFunction(() => document.querySelector('a[href*="portfolioId="]') !== null, {
        timeout: 30_000,
        polling: 500,
      })
      .catch(async () => {
        const url = await page.evaluate(() => window.location.href);
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]'))
            .map((a) => a.getAttribute('href'))
            .join('\n'),
        );
        throw new Error(
          `[login] Account cards not found after 30s.\nURL: ${url}\nLinks on page:\n${links}`,
        );
      });

    // Step 4: Extract all identifiers
    const { portfolioId, savingsId } = await extractAccountIds(page);
    console.log(`[login] Extracted portfolioId: ${portfolioId}`);
    if (savingsId) console.log(`[login] Extracted savingsId: ${savingsId}`);

    const personId = await extractPersonIdFromCookies(page);
    console.log(`[login] Extracted personId: ${personId}`);

    const cookies = await extractCookies(page);
    console.log(`[login] Extracted ${cookies.length} cookies.`);

    const session = createSession(cookies, personId, portfolioId, savingsId);
    setSession(session);
    await persistSession(session);

    console.log('[login] Session created and persisted successfully.');
    return session;
  } finally {
    await browser.close();
  }
}
