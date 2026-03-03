import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import { subscriptionManager } from '../../scalable/subscription.ts';
import {
  GET_PORTFOLIO_GROUPS_INVENTORY,
  GET_SUSPENSE_WATCHLIST,
  GET_CASH_BREAKDOWN,
  GET_INTERESTS,
  QUERY_PENDING_ORDERS,
  GET_APPROPRIATENESS_RESULT,
  GET_CRYPTO_PERFORMANCE,
  TIME_WEIGHTED_RETURN,
} from '../../scalable/operations/portfolio-queries.ts';

const router = Router();

// GET /portfolio — current portfolio valuation snapshot
// Returns the latest value received from the realTimeValuation WebSocket subscription,
// cached for up to 30 s. Returns { source: 'unavailable' } if no realtime data is available.
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

  res.json({ source: 'unavailable' });
});

// GET /portfolio/inventory
router.get('/inventory', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getPortfolioGroupsInventory',
    query: GET_PORTFOLIO_GROUPS_INVENTORY,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/watchlist
router.get('/watchlist', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getSuspenseWatchlist',
    query: GET_SUSPENSE_WATCHLIST,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/cash
router.get('/cash', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getCashBreakdown',
    query: GET_CASH_BREAKDOWN,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/interest-rates
router.get('/interest-rates', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getInterests',
    query: GET_INTERESTS,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/pending-orders
router.get('/pending-orders', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'queryPendingOrders',
    query: QUERY_PENDING_ORDERS,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/appropriateness
router.get('/appropriateness', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getAppropriatenessResult',
    query: GET_APPROPRIATENESS_RESULT,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/crypto-performance
router.get('/crypto-performance', requireSession, async (_req, res) => {
  const session = getSession()!;

  const result = await graphqlRequest({
    operationName: 'getCryptoPerformance',
    query: GET_CRYPTO_PERFORMANCE,
    variables: { personId: session.personId, portfolioId: session.portfolioId },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /portfolio/timeseries
router.get('/timeseries', requireSession, async (req, res) => {
  const session = getSession()!;
  const includeYearToDate = req.query['includeYearToDate'] === 'true' ? true : undefined;

  const result = await graphqlRequest({
    operationName: 'timeWeightedReturn',
    query: TIME_WEIGHTED_RETURN,
    variables: {
      personId: session.personId,
      portfolioId: session.portfolioId,
      includeYearToDate,
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

export default router;
