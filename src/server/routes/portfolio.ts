import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { subscriptionManager } from '../../scalable/subscription.ts';

const router = Router();

// GET /portfolio — current portfolio valuation snapshot
router.get('/', requireSession, async (_req, res) => {
  const realtime = await subscriptionManager.fetchLatest();

  if (realtime) {
    res.json({
      source: 'realtime',
      valuation: realtime.valuation,
      securitiesValuation: realtime.securitiesValuation,
      unrealisedReturn: realtime.unrealisedReturn,
      cryptoValuation: realtime.cryptoValuation,
      timeWeightedReturnByTimeframe: realtime.timeWeightedReturnByTimeframe,
      timestampUtc: realtime.timestampUtc,
    });
    return;
  }

  const session = getSession()!;
  res.json({
    source: 'session',
    valuation: session.valuation,
  });
});

export default router;
