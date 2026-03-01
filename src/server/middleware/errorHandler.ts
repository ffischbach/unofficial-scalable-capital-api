import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AuthenticationError } from '../../scalable/client.ts';

// 4-arg signature required for Express to treat this as error handler
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AuthenticationError) {
    res.status(401).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.flatten().fieldErrors });
    return;
  }

  console.error('[errorHandler] Unhandled error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: message });
}
