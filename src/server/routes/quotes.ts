import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { quoteManager } from '../../scalable/quoteSubscription.ts';
import { ISIN_RE } from './validate.ts';

const router = Router();

/**
 * GET /quotes/stream?isins=ISIN1,ISIN2,...
 *
 * Server-Sent Events stream of real-time bid/ask/mid quote ticks for the given ISINs.
 * Each event is a JSON-encoded QuoteTick object.
 *
 * Example (curl):
 *   curl -N "http://127.0.0.1:3141/quotes/stream?isins=US02079K3059,US0231351067"
 *
 * Example (JS):
 *   const es = new EventSource('http://127.0.0.1:3141/quotes/stream?isins=US02079K3059');
 *   es.onmessage = (e) => console.log(JSON.parse(e.data));
 */
router.get('/stream', requireSession, (req: Request, res: Response) => {
  const raw = req.query['isins'];
  const isins =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (isins.length === 0) {
    res
      .status(400)
      .json({ error: 'Query parameter "isins" is required (comma-separated list of ISINs).' });
    return;
  }

  const invalid = isins.filter((s) => !ISIN_RE.test(s));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid ISINs: ${invalid.join(', ')}` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const unsubscribe = quoteManager.subscribe(isins, (tick) => {
    res.write(`data: ${JSON.stringify(tick)}\n\n`);
  });

  req.on('close', unsubscribe);
});

export default router;
