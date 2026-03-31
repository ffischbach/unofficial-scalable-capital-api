import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeMockSession, setupRouteTest } from './test-helpers.ts';

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
import router from './securities.ts';

const mockGetSession = vi.mocked(getSession);
const mockGraphqlRequest = vi.mocked(graphqlRequest);

const VALID_ISIN = 'US0378331005';
const INVALID_ISIN = 'TOOSHORT';

const ctx = setupRouteTest(router);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockReturnValue(makeMockSession());
});

describe('ISIN validation', () => {
  it('returns 400 for an invalid ISIN param', async () => {
    const res = await fetch(`${ctx.baseUrl}/${INVALID_ISIN}`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts a valid 12-character alphanumeric ISIN', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    const res = await fetch(`${ctx.baseUrl}/${VALID_ISIN}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /:isin', () => {
  it('calls getSecurity with isin and session ids', async () => {
    const data = { account: { brokerPortfolio: { security: {} } } };
    mockGraphqlRequest.mockResolvedValue({ data });

    const res = await fetch(`${ctx.baseUrl}/${VALID_ISIN}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(data);
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getSecurity',
        variables: { personId: 'person-1', portfolioId: 'portfolio-1', isin: VALID_ISIN },
      }),
    );
  });

  it('returns 502 on GraphQL errors', async () => {
    mockGraphqlRequest.mockResolvedValue({ errors: [{ message: 'not found' }] });

    const res = await fetch(`${ctx.baseUrl}/${VALID_ISIN}`);

    expect(res.status).toBe(502);
  });
});

describe('GET /:isin/info', () => {
  it('calls getSecurityInfo', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/info`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: 'getSecurityInfo' }),
    );
  });
});

describe('GET /:isin/static', () => {
  it('calls getStaticSecurityInfo', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/static`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operationName: 'getStaticSecurityInfo' }),
    );
  });
});

describe('GET /:isin/tick', () => {
  it('passes source and includeYearToDate query params', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/tick?source=XETRA&includeYearToDate=true`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getSecurityTick',
        variables: expect.objectContaining({
          isin: VALID_ISIN,
          source: 'XETRA',
          includeYearToDate: true,
        }),
      }),
    );
  });

  it('defaults source to null and includeYearToDate to undefined', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/tick`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ source: null, includeYearToDate: undefined }),
      }),
    );
  });
});

describe('GET /:isin/timeseries', () => {
  it('uses all timeframes by default', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/timeseries`);

    const call = mockGraphqlRequest.mock.calls[0][0];
    expect(call.variables).toMatchObject({ isin: VALID_ISIN });
    expect((call.variables as { timeframes: string[] }).timeframes).toContain('ONE_YEAR');
    expect((call.variables as { timeframes: string[] }).timeframes).toHaveLength(8);
  });

  it('uses custom timeframes from query param', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/timeseries?timeframes=ONE_WEEK,ONE_MONTH`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ timeframes: ['ONE_WEEK', 'ONE_MONTH'] }),
      }),
    );
  });

  it('does not pass session ids (no personId/portfolioId)', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/timeseries`);

    const variables = mockGraphqlRequest.mock.calls[0][0].variables as Record<string, unknown>;
    expect(variables).not.toHaveProperty('personId');
    expect(variables).not.toHaveProperty('portfolioId');
  });
});

describe('GET /:isin/tradability', () => {
  it('calls getTradingTradability with session ids and isin', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/tradability`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'getTradingTradability',
        variables: { personId: 'person-1', portfolioId: 'portfolio-1', isin: VALID_ISIN },
      }),
    );
  });
});

describe('GET /:isin/buyable', () => {
  it('passes custodianBanks as array when provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/buyable?custodianBanks=BAADER,FLATEX`);

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        operationName: 'isSecurityBuyable',
        variables: expect.objectContaining({ custodianBanks: ['BAADER', 'FLATEX'] }),
      }),
    );
  });

  it('omits custodianBanks when not provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await fetch(`${ctx.baseUrl}/${VALID_ISIN}/buyable`);

    const variables = mockGraphqlRequest.mock.calls[0][0].variables as Record<string, unknown>;
    expect(variables['custodianBanks']).toBeUndefined();
  });
});
