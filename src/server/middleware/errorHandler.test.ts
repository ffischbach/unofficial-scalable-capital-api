import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler } from './errorHandler.ts';
import { AuthenticationError } from '../../scalable/client.ts';

function makeMockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

const mockReq = {} as never;
const mockNext = vi.fn();

describe('errorHandler', () => {
  it('responds 401 for AuthenticationError', () => {
    const res = makeMockRes();
    errorHandler(new AuthenticationError('not authed'), mockReq, res as never, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'not authed' });
  });

  it('responds 400 for ZodError', () => {
    const res = makeMockRes();
    let zodError: z.ZodError;
    try {
      z.object({ name: z.string() }).parse({ name: 123 });
    } catch (e) {
      zodError = e as z.ZodError;
    }
    errorHandler(zodError!, mockReq, res as never, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0] as { error: string; details: unknown };
    expect(jsonArg.error).toBe('Validation error');
    expect(jsonArg).toHaveProperty('details');
  });

  it('responds 500 for generic Error', () => {
    const res = makeMockRes();
    errorHandler(new Error('oops'), mockReq, res as never, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'oops' });
  });

  it('responds 500 with generic message for non-Error thrown value', () => {
    const res = makeMockRes();
    errorHandler('string error', mockReq, res as never, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
