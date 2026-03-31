import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('../middleware/requireSession.ts', () => ({
  requireSession: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../auth/session.ts', () => ({
  getSession: vi.fn(),
}));

vi.mock('../../scalable/client.ts', () => ({
  graphqlRequest: vi.fn(),
}));

vi.mock('../../scalable/subscription.ts', () => ({
  subscriptionManager: { fetchLatest: vi.fn() },
}));

import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import { subscriptionManager } from '../../scalable/subscription.ts';
import router from './portfolio.ts';

const mockGetSession = vi.mocked(getSession);
const mockGraphqlRequest = vi.mocked(graphqlRequest);
const mockFetchLatest = vi.mocked(subscriptionManager.fetchLatest);

const mockSession = {
  cookies: [],
  personId: 'person-1',
  portfolioId: 'portfolio-1',
  savingsId: null,
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const app = express();
  app.use('/', router);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReturnValue(mockSession);
});

describe('GET /', () => {
  it('returns realtime snapshot when subscription data is available', async () => {
    const realtimeData = {
      valuation: 1000,
      securitiesValuation: 900,
      unrealisedReturn: 50,
      cryptoValuation: 100,
      timeWeightedReturnByTimeframe: [],
      timestampUtc: '2024-01-01T00:00:00Z',
    };
    mockFetchLatest.mockResolvedValue(realtimeData as never);

    const res = await fetch(`${baseUrl}/`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ source: 'realtime', ...realtimeData });
  });

  it('returns source: unavailable when no realtime data', async () => {
    mockFetchLatest.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ source: 'unavailable' });
  });
});

describe('GET /inventory', () => {
  it('returns data on success', async () => {
    const data = { account: { brokerPortfolio: { groups: [] } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${baseUrl}/inventory`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(data);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getPortfolioGroupsInventory',
        variables: { personId: 'person-1', portfolioId: 'portfolio-1' },
      }),
    );
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'upstream error' }] });

    const res = await fetch(`${baseUrl}/inventory`);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toHaveProperty('errors');
  });
});

describe('GET /watchlist', () => {
  it('calls getSuspenseWatchlist with session ids', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${baseUrl}/watchlist`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getSuspenseWatchlist',
        variables: { personId: 'person-1', portfolioId: 'portfolio-1' },
      }),
    );
  });
});

describe('GET /cash', () => {
  it('calls getCashBreakdown and returns data', async () => {
    const data = { account: { brokerPortfolio: { cashBreakdown: {} } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${baseUrl}/cash`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(data);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: 'getCashBreakdown' }),
    );
  });
});

describe('GET /timeseries', () => {
  it('passes includeYearToDate=true when query param is "true"', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${baseUrl}/timeseries?includeYearToDate=true`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'timeWeightedReturn',
        variables: expect.objectContaining({ includeYearToDate: true }),
      }),
    );
  });

  it('passes includeYearToDate=undefined when query param is absent', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${baseUrl}/timeseries`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeYearToDate: undefined }),
      }),
    );
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'bad' }] });

    const res = await fetch(`${baseUrl}/timeseries`);

    expect(res.status).toBe(502);
  });
});
