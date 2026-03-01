import type { Request, Response, NextFunction } from 'express';
import { getSession, isSessionValid } from '../../auth/session.ts';

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const session = getSession();
  if (!session || !isSessionValid(session)) {
    res.status(401).json({ error: 'Not authenticated. POST /auth/login first.' });
    return;
  }
  next();
}
