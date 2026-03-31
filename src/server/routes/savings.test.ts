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
import router from './savings.ts';

const mockGetSession = vi.mocked(getSession);
const mockGraphqlRequest = vi.mocked(graphqlRequest);

const sessionWithSavings = {
  cookies: [],
  personId: 'person-1',
  portfolioId: 'portfolio-1',
  savingsId: 'savings-1',
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

const sessionWithoutSavings = { ...sessionWithSavings, savingsId: null };

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
});

describe('GET /', () => {
  it('returns 503 when session has no savingsId', async () => {
    mockGetSession.mockReturnValue(sessionWithoutSavings);

    const res = await fetch(`${baseUrl}/`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toHaveProperty('error');
    expect(mockGraphqlRequest).not.toHaveBeenCalled();
  });

  it('returns mapped account fields on success', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    const savingsAccount = {
      id: 'acc-1',
      totalAmount: { value: '5000.00', currency: 'EUR' },
      depositInterestRate: '0.04',
      nextPayoutDate: '2024-07-01',
      interests: [],
    };
    mockGraphqlRequest.mockResolvedValue({
      data: { account: { savingsAccount } },
    });

    const res = await fetch(`${baseUrl}/`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: savingsAccount.id,
      totalAmount: savingsAccount.totalAmount,
      depositInterestRate: savingsAccount.depositInterestRate,
      nextPayoutDate: savingsAccount.nextPayoutDate,
      interests: savingsAccount.interests,
    });
  });

  it('calls OvernightOverview with savingsId as savingsAccountId', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    mockGraphqlRequest.mockResolvedValue({ data: { account: { savingsAccount: {} } } });

    await fetch(`${baseUrl}/`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'OvernightOverview',
        variables: { accountId: 'person-1', savingsAccountId: 'savings-1' },
      }),
    );
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'upstream error' }] });

    const res = await fetch(`${baseUrl}/`);

    expect(res.status).toBe(502);
  });
});

describe('GET /transactions', () => {
  it('returns 503 when session has no savingsId', async () => {
    mockGetSession.mockReturnValue(sessionWithoutSavings);

    const res = await fetch(`${baseUrl}/transactions`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toHaveProperty('error');
  });

  it.each([
    ['0', 'below minimum'],
    ['201', 'above maximum'],
    ['xyz', 'non-numeric'],
  ])('returns 400 for limit=%s (%s)', async (limit) => {
    mockGetSession.mockReturnValue(sessionWithSavings);

    const res = await fetch(`${baseUrl}/transactions?limit=${limit}`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('defaults limit to 50', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    mockGraphqlRequest.mockResolvedValue({ data: { account: { savingsAccount: {} } } });

    await fetch(`${baseUrl}/transactions`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'OvernightOverviewPageData',
        variables: expect.objectContaining({
          recentTransactionsInput: { pageSize: 50 },
        }),
      }),
    );
  });

  it('returns transactions array from nested response', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    const transactions = [{ id: 'tx-1', amount: '100' }];
    mockGraphqlRequest.mockResolvedValue({
      data: {
        account: { savingsAccount: { moreTransactions: { transactions } } },
      },
    });

    const res = await fetch(`${baseUrl}/transactions`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ transactions });
  });

  it('returns empty transactions array when path is missing in response', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    mockGraphqlRequest.mockResolvedValue({ data: { account: { savingsAccount: {} } } });

    const res = await fetch(`${baseUrl}/transactions`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ transactions: [] });
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGetSession.mockReturnValue(sessionWithSavings);
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'bad' }] });

    const res = await fetch(`${baseUrl}/transactions`);

    expect(res.status).toBe(502);
  });
});
