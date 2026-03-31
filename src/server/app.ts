import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
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

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Optional gateway token middleware (exempts /auth and /docs routes)
  if (config.token) {
    const token = config.token;
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.path.startsWith('/auth') ||
        req.path.startsWith('/docs') ||
        req.path === '/openapi.json'
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

  // Health check — no auth required
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
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
