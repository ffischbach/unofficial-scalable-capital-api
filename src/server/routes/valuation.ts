import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { subscriptionManager } from '../../scalable/subscription.ts';

const router = Router();

/** Comment-line heartbeat interval, keeping proxies and clients from timing the stream out. */
const HEARTBEAT_MS = 15_000;

/**
 * GET /valuation/stream
 *
 * Server-Sent Events stream of real-time portfolio valuation.
 * Each event is a JSON-encoded RealTimeValuation object.
 *
 * Example (curl):
 *   curl -N http://127.0.0.1:3141/valuation/stream
 *
 * Example (JS):
 *   const es = new EventSource('http://127.0.0.1:3141/valuation/stream');
 *   es.onmessage = (e) => console.log(JSON.parse(e.data));
 */
router.get('/stream', requireSession, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Replay the last known valuation so a client sees a value at once instead of
  // waiting for the next upstream tick.
  const cached = subscriptionManager.getLastValuation();
  if (cached) res.write(`data: ${JSON.stringify(cached)}\n\n`);

  const unsubscribe = subscriptionManager.subscribe((data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
