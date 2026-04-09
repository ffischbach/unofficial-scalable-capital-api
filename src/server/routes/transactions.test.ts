import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeMockSession, setupRouteTest } from './test-helpers.ts';

vi.mock('../middleware/requireSession.ts', () => ({
  requireSession: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../auth/session.ts', () => ({
  getSession: vi.fn(),
}));

vi.mock('../../scalable/client.ts', async (importActual) => {
  const actual = await importActual<typeof import('../../scalable/client.ts')>();
  return {
    ...actual,
    graphqlRequest: vi.fn(),
    buildCookieHeader: vi.fn(() => 'cookie=value'),
  };
});

import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import router from './transactions.ts';

const mockGetSession = vi.mocked(getSession);
const mockGraphqlRequest = vi.mocked(graphqlRequest);

const ctx = setupRouteTest(router);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReturnValue(makeMockSession());
});

describe('GET / — pageSize validation', () => {
  it.each([
    ['0', 'below minimum'],
    ['201', 'above maximum'],
    ['abc', 'non-numeric'],
    ['1.5', 'non-integer'],
  ])('returns 400 for pageSize=%s (%s)', async (pageSize) => {
    const res = await fetch(`${ctx.baseUrl}/?pageSize=${pageSize}`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts boundary values 1 and 200', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    const res1 = await fetch(`${ctx.baseUrl}/?pageSize=1`);
    expect(res1.status).toBe(200);

    const res200 = await fetch(`${ctx.baseUrl}/?pageSize=200`);
    expect(res200.status).toBe(200);
  });
});

describe('GET / — isin validation', () => {
  it('returns 400 for an invalid ISIN', async () => {
    const res = await fetch(`${ctx.baseUrl}/?isin=TOOSHORT`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts a valid 12-character ISIN', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    const res = await fetch(`${ctx.baseUrl}/?isin=US0378331005`);

    expect(res.status).toBe(200);
  });
});

describe('GET /:id — transaction details', () => {
  it('passes transactionId and session ids to the GraphQL query', async () => {
    const data = { account: { brokerPortfolio: { transactionDetails: { id: 'tx-1' } } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${ctx.baseUrl}/tx-1`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(data);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getTransactionDetails',
        variables: { personId: 'person-1', portfolioId: 'portfolio-1', transactionId: 'tx-1' },
      }),
    );
  });

  it('returns 400 for an invalid transaction id', async () => {
    const res = await fetch(`${ctx.baseUrl}/inv@lid!id`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 404 when transactionDetails is null', async () => {
    mockGraphqlRequest.mockResolvedValue({
      data: { account: { brokerPortfolio: { transactionDetails: null } } },
    });

    const res = await fetch(`${ctx.baseUrl}/tx-not-found`);

    expect(res.status).toBe(404);
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'not found' }] });

    const res = await fetch(`${ctx.baseUrl}/tx-missing`);

    expect(res.status).toBe(502);
  });
});

describe('GET / — success', () => {
  it('uses default params when none provided', async () => {
    const data = { account: { brokerPortfolio: { moreTransactions: { transactions: [] } } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${ctx.baseUrl}/`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(data);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'moreTransactions',
        variables: expect.objectContaining({
          personId: 'person-1',
          portfolioId: 'portfolio-1',
          input: { pageSize: 20, cursor: null, isin: undefined, searchTerm: '', type: [], status: [] },
        }),
      }),
    );
  });

  it('passes all query params to the GraphQL variables', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(
      `${ctx.baseUrl}/?pageSize=50&cursor=abc123&isin=US0378331005&searchTerm=apple&type=BUY,SELL&status=EXECUTED`,
    );

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: {
            pageSize: 50,
            cursor: 'abc123',
            isin: 'US0378331005',
            searchTerm: 'apple',
            type: ['BUY', 'SELL'],
            status: ['EXECUTED'],
          },
        }),
      }),
    );
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'upstream failure' }] });

    const res = await fetch(`${ctx.baseUrl}/`);

    expect(res.status).toBe(502);
  });
});

describe('GET /documents/:id — document download', () => {
  const upstreamFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Pass through localhost calls (test → route server); intercept Scalable calls.
    vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href.startsWith('https://de.scalable.capital')) {
        return upstreamFetch(href, init);
      }
      return originalFetch(url, init);
    });
    upstreamFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies a PDF response with correct headers', async () => {
    const pdfBytes = Buffer.from('%PDF-test');
    upstreamFetch.mockResolvedValue(
      new Response(pdfBytes, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="Kosteninformation.pdf"',
        },
      }),
    );

    const res = await fetch(`${ctx.baseUrl}/documents/iRRfCi1iMGpLu2aZQKnKfY`);
    const body = await res.arrayBuffer();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(body)).toEqual(pdfBytes);
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://de.scalable.capital/broker/api/download/iRRfCi1iMGpLu2aZQKnKfY?id=iRRfCi1iMGpLu2aZQKnKfY',
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: 'cookie=value' }) }),
    );
  });

  it('constructs the download path from date, label, and isin', async () => {
    upstreamFetch.mockResolvedValue(
      new Response(Buffer.from('%PDF-test'), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );

    await fetch(
      `${ctx.baseUrl}/documents/iRRfCi1iMGpLu2aZQKnKfY?date=2026-03-26&label=Kosteninformation&isin=IE00B3RBWM25`,
    );

    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://de.scalable.capital/broker/api/download/2026-03-26-Kosteninformation-IE00B3RBWM25?id=iRRfCi1iMGpLu2aZQKnKfY',
      expect.anything(),
    );
  });

  it('returns 400 for an invalid document id', async () => {
    const res = await fetch(`${ctx.baseUrl}/documents/inv@lid!`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 502 when upstream is not ok', async () => {
    upstreamFetch.mockResolvedValue(new Response(null, { status: 404 }));

    const res = await fetch(`${ctx.baseUrl}/documents/nonexistent-doc`);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toHaveProperty('error');
  });

  it.each([
    ['date=2026-03-26', 'only date'],
    ['date=2026-03-26&label=Kosteninformation', 'date and label'],
    ['label=Kosteninformation&isin=IE00B3RBWM25', 'label and isin'],
  ])('returns 400 when partial params are provided (%s)', async (qs) => {
    const res = await fetch(`${ctx.baseUrl}/documents/iRRfCi1iMGpLu2aZQKnKfY?${qs}`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});
