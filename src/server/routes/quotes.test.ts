import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupRouteTest } from './test-helpers.ts';

vi.mock('../middleware/requireSession.ts', () => ({
  requireSession: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../scalable/quoteSubscription.ts', () => ({
  quoteManager: { subscribe: vi.fn() },
}));

import { quoteManager } from '../../scalable/quoteSubscription.ts';
import router from './quotes.ts';

const mockSubscribe = vi.mocked(quoteManager.subscribe);

const ctx = setupRouteTest(router);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: subscribe returns a no-op unsubscribe function
  mockSubscribe.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('GET /stream — validation', () => {
  it('returns 400 when isins query param is absent', async () => {
    const res = await fetch(`${ctx.baseUrl}/stream`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when isins param is an empty string', async () => {
    const res = await fetch(`${ctx.baseUrl}/stream?isins=`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when any ISIN is invalid', async () => {
    const res = await fetch(`${ctx.baseUrl}/stream?isins=US0378331005,TOOSHORT`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid isins/i);
  });

  it('returns 400 when all ISINs are invalid', async () => {
    const res = await fetch(`${ctx.baseUrl}/stream?isins=TOOSHORT,ALSOBAD`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('GET /stream — success', () => {
  it('sets SSE headers and calls quoteManager.subscribe with parsed ISINs', async () => {
    const abortController = new AbortController();

    const fetchPromise = fetch(`${ctx.baseUrl}/stream?isins=US0378331005,DE0005140008`, {
      signal: abortController.signal,
    }).catch(() => null); // AbortError on cleanup is expected

    // Give the route handler time to run before we abort
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockSubscribe).toHaveBeenCalledWith(
      ['US0378331005', 'DE0005140008'],
      expect.any(Function),
    );

    abortController.abort();
    await fetchPromise;
  });

  it('accepts a single valid ISIN', async () => {
    const abortController = new AbortController();

    fetch(`${ctx.baseUrl}/stream?isins=US0378331005`, {
      signal: abortController.signal,
    }).catch(() => null);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(mockSubscribe).toHaveBeenCalledWith(['US0378331005'], expect.any(Function));

    abortController.abort();
  });
});
