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

import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import router from './transactions.ts';

const mockGetSession = vi.mocked(getSession);
const mockGraphqlRequest = vi.mocked(graphqlRequest);

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

describe('GET / — pageSize validation', () => {
  it.each([
    ['0', 'below minimum'],
    ['201', 'above maximum'],
    ['abc', 'non-numeric'],
    ['1.5', 'non-integer'],
  ])('returns 400 for pageSize=%s (%s)', async (pageSize) => {
    const res = await fetch(`${baseUrl}/?pageSize=${pageSize}`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts boundary values 1 and 200', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    const res1 = await fetch(`${baseUrl}/?pageSize=1`);
    expect(res1.status).toBe(200);

    const res200 = await fetch(`${baseUrl}/?pageSize=200`);
    expect(res200.status).toBe(200);
  });
});

describe('GET / — isin validation', () => {
  it('returns 400 for an invalid ISIN', async () => {
    const res = await fetch(`${baseUrl}/?isin=TOOSHORT`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts a valid 12-character ISIN', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    const res = await fetch(`${baseUrl}/?isin=US0378331005`);

    expect(res.status).toBe(200);
  });
});

describe('GET / — success', () => {
  it('uses default params when none provided', async () => {
    const data = { account: { brokerPortfolio: { moreTransactions: { transactions: [] } } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${baseUrl}/`);
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
      `${baseUrl}/?pageSize=50&cursor=abc123&isin=US0378331005&searchTerm=apple&type=BUY,SELL&status=EXECUTED`,
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

    const res = await fetch(`${baseUrl}/`);

    expect(res.status).toBe(502);
  });
});
