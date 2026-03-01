import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import authRouter from './routes/auth.ts';
import proxyRouter from './routes/proxy.ts';
import type { GatewayConfig } from '../types.ts';

export function createApp(config: GatewayConfig): express.Application {
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '10mb' }));

  // Optional gateway token middleware (exempts /auth routes)
  if (config.token) {
    const token = config.token;
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/auth')) {
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

  // Routes
  app.use('/auth', authRouter);
  app.use('/proxy', proxyRouter);
  // Error handler — must be last
  app.use(errorHandler);

  return app;
}
