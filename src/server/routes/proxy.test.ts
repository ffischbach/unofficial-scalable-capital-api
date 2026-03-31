import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { setupRouteTest } from './test-helpers.ts';

vi.mock('../middleware/requireSession.ts', () => ({
  requireSession: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../../scalable/client.ts', () => ({
  graphqlRequest: vi.fn(),
}));

import { graphqlRequest } from '../../scalable/client.ts';
import proxyRouter from './proxy.ts';

const mockGraphqlRequest = vi.mocked(graphqlRequest);

// The proxy route reads req.body, so we need the JSON body-parser middleware.
const router = express.Router();
router.use(express.json());
router.use('/', proxyRouter);

const ctx = setupRouteTest(router);

beforeEach(() => {
  vi.clearAllMocks();
});

function post(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('POST /proxy — validation', () => {
  it('returns 400 when operationName is missing', async () => {
    const res = await post(`${ctx.baseUrl}/`, { query: '{ test }' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when query is missing', async () => {
    const res = await post(`${ctx.baseUrl}/`, { operationName: 'TestOp' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when both fields are missing', async () => {
    const res = await post(`${ctx.baseUrl}/`, {});
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('POST /proxy — success', () => {
  it('passes operationName, query and variables to graphqlRequest', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: { result: 42 } });

    await post(`${ctx.baseUrl}/`, {
      operationName: 'TestOp',
      query: '{ test }',
      variables: { foo: 'bar' },
    });

    expect(mockGraphqlRequest).toHaveBeenCalledWith({
      operationName: 'TestOp',
      query: '{ test }',
      variables: { foo: 'bar' },
    });
  });

  it('defaults variables to {} when not provided', async () => {
    mockGraphqlRequest.mockResolvedValue({ data: {} });

    await post(`${ctx.baseUrl}/`, { operationName: 'TestOp', query: '{ test }' });

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.objectContaining({ variables: {} }),
    );
  });

  it('returns the graphqlRequest result as JSON', async () => {
    const result = { data: { portfolio: { id: 'p1' } } };
    mockGraphqlRequest.mockResolvedValue(result);

    const res = await post(`${ctx.baseUrl}/`, { operationName: 'TestOp', query: '{ test }' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(result);
  });
});
