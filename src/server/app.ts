import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import { getSession, isSessionValid } from '../auth/session.ts';
import authRouter from './routes/auth.ts';
import proxyRouter from './routes/proxy.ts';
import valuationRouter from './routes/valuation.ts';
import portfolioRouter from './routes/portfolio.ts';
import quotesRouter from './routes/quotes.ts';
import securitiesRouter from './routes/securities.ts';
import transactionsRouter from './routes/transactions.ts';
import savingsRouter from './routes/savings.ts';
import { spec, scalarMiddleware } from './openapi.ts';
import type { GatewayConfig } from '../types.ts';

export function createApp(config: GatewayConfig): express.Application {
  const app = express();

  // CORS — allow any localhost/127.0.0.1 origin (local frontend dev)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin ?? '';
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Gateway-Token');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Optional gateway token middleware (exempts /auth, /docs, and /health
  // routes — except /auth/import, which injects a fully authenticated
  // session and must stay behind the token even when the rest of /auth
  // doesn't need it)
  if (config.token) {
    const token = config.token;
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        (req.path.startsWith('/auth') && req.path !== '/auth/import') ||
        req.path.startsWith('/docs') ||
        req.path === '/openapi.json' ||
        req.path === '/health'
      ) {
        next();
        return;
      }
      const provided = req.headers['x-gateway-token'];
      if (provided !== token) {
        res.status(401).json({ error: 'Invalid or missing X-Gateway-Token header.' });
        return;
      }
      next();
    });
  }

  // Health check — no auth required. Also reports session freshness so a
  // single curl can double as a "is the silent-refresh still working" check.
  app.get('/health', (_req, res) => {
    const session = getSession();
    const authenticated = !!session && isSessionValid(session);
    res.json({
      status: 'ok',
      authenticated,
      expiresAt: authenticated ? session!.expiresAt : null,
    });
  });

  // API docs
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.get('/docs', scalarMiddleware);

  // Routes
  app.use('/auth', authRouter);
  app.use('/proxy', proxyRouter);
  app.use('/valuation', valuationRouter);
  app.use('/portfolio', portfolioRouter);
  app.use('/quotes', quotesRouter);
  app.use('/securities', securitiesRouter);
  app.use('/transactions', transactionsRouter);
  app.use('/savings', savingsRouter);

  // 404 catch-all — must be before error handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
