import type { Request, Response, NextFunction } from 'express';
import { getSession, isSessionValid } from '../../auth/session.ts';
import { ensureSilentRefresh } from '../../scalable/client.ts';

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = getSession();
  if (session && isSessionValid(session)) {
    next();
    return;
  }

  // Session exists but is expired — try a silent (headless) refresh before
  // giving up, so callers don't get bounced to interactive /auth/login just
  // because the TTL passed while the underlying auth cookie is still good.
  if (session) {
    const refreshed = await ensureSilentRefresh();
    if (refreshed) {
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Not authenticated. POST /auth/login first.' });
}
