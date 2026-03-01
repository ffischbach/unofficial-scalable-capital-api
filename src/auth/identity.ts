import type { Page } from 'puppeteer';
import type { Cookie } from '../types.ts';

const FIBER_WALK_SCRIPT = `(function () {
  function visit(node) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const sub of node) { const r = visit(sub); if (r) return r; }
      return null;
    }
    if (typeof node === 'object') {
      if (node.personId) return node.personId;
      for (const key in node) {
        if (['children','props','security','items'].includes(key) ||
            key.startsWith('__reactProps')) {
          const r = visit(node[key]); if (r) return r;
        }
      }
    }
    if (node.childNodes?.forEach) {
      for (const child of node.childNodes) { const r = visit(child); if (r) return r; }
    }
    return null;
  }
  return visit(document.body);
})()`;

export async function extractPersonId(page: Page): Promise<string> {
  const result = await page.evaluate(FIBER_WALK_SCRIPT);
  if (typeof result !== 'string' || !result) {
    throw new Error('Could not extract personId via React fiber walk.');
  }
  return result;
}

export async function extractPortfolioId(page: Page): Promise<string> {
  // 1. Try URL query param (most reliable when client router has run)
  const url = page.url();
  const urlMatch = url.match(/portfolioId=([^&]+)/);
  if (urlMatch?.[1]) return urlMatch[1];

  // 2. Fallback: scan __NEXT_DATA__ for a BrokerValuation:xxx key — xxx is the portfolioId
  const fromNextData = await page.evaluate((): string | null => {
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el?.textContent) return null;
      const data = JSON.parse(el.textContent) as Record<string, unknown>;
      const result = (data?.props as Record<string, unknown>)?.initialQueryResult as Record<string, unknown> | undefined;
      if (!result) return null;
      for (const key of Object.keys(result)) {
        const m = key.match(/^BrokerValuation:(.+)$/);
        if (m?.[1]) return m[1];
      }
      return null;
    } catch {
      return null;
    }
  });
  if (fromNextData) {
    console.log('[identity] portfolioId extracted from __NEXT_DATA__:', fromNextData);
    return fromNextData;
  }

  // 3. Fallback: React fiber walk looking for portfolioId property
  const fromFiber = await page.evaluate(`(function () {
    function visit(node) {
      if (!node) return null;
      if (Array.isArray(node)) {
        for (const sub of node) { const r = visit(sub); if (r) return r; }
        return null;
      }
      if (typeof node === 'object') {
        if (node.portfolioId && typeof node.portfolioId === 'string') return node.portfolioId;
        for (const key in node) {
          if (['children','props','security','items','portfolio','broker'].includes(key) ||
              key.startsWith('__reactProps')) {
            const r = visit(node[key]); if (r) return r;
          }
        }
      }
      return null;
    }
    return visit(document.body);
  })()`);
  if (typeof fromFiber === 'string' && fromFiber) {
    console.log('[identity] portfolioId extracted via fiber walk:', fromFiber);
    return fromFiber;
  }

  throw new Error(
    `Could not extract portfolioId from URL (${url}), __NEXT_DATA__, or fiber walk.`,
  );
}

export async function extractValuation(page: Page, portfolioId: string): Promise<string> {
  // Wait for __NEXT_DATA__ to be populated
  await page.waitForFunction(
    () => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el || !el.textContent) return false;
      try {
        const data = JSON.parse(el.textContent);
        return !!data?.props?.initialQueryResult;
      } catch {
        return false;
      }
    },
    { timeout: 15_000 },
  );

  const valuation = await page.evaluate((pid: string) => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el || !el.textContent) return null;
    try {
      const data = JSON.parse(el.textContent);
      const key = `BrokerValuation:${pid}`;
      const result = data?.props?.initialQueryResult?.[key]?.valuation;
      if (result != null) return String(result);

      // Fallback: log available keys for debugging
      const keys = Object.keys(data?.props?.initialQueryResult ?? {});
      console.warn('[identity] __NEXT_DATA__ keys:', keys.join(', '));
      return null;
    } catch (e) {
      console.warn('[identity] Failed to parse __NEXT_DATA__:', e);
      return null;
    }
  }, portfolioId);

  if (valuation == null) {
    throw new Error(`Could not extract valuation for portfolioId ${portfolioId} from __NEXT_DATA__`);
  }

  return valuation;
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
