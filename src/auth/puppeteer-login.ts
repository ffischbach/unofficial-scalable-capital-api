import puppeteer from 'puppeteer';
import {
  extractPortfolioId,
  extractPersonId,
  extractCookies,
} from './identity.ts';
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
    await page.waitForFunction(
      () => !window.location.pathname.includes('secure-login'),
      { timeout: 120_000, polling: 500 },
    );

    console.log('[login] Login detected. Navigating to transactions page...');

    // Step 3: Navigate to transactions to get portfolioId from URL
    await page.goto('https://de.scalable.capital/broker/transactions', {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    });

    // The Next.js client router adds portfolioId to the URL asynchronously — wait for it
    await page
      .waitForFunction(() => window.location.href.includes('portfolioId='), {
        timeout: 120_000,
        polling: 500,
      })
      .catch(() => {
        console.log('[login] portfolioId not in URL after 10s — will try alternative extraction...');
      });

    const portfolioId = await extractPortfolioId(page);
    console.log(`[login] Extracted portfolioId: ${portfolioId}`);

    const personId = await extractPersonId(page);
    console.log(`[login] Extracted personId: ${personId}`);

    const cookies = await extractCookies(page);
    console.log(`[login] Extracted ${cookies.length} cookies.`);

    const session = createSession(cookies, personId, portfolioId);
    setSession(session);
    await persistSession(session);

    console.log('[login] Session created and persisted successfully.');
    return session;
  } finally {
    await browser.close();
  }
}
