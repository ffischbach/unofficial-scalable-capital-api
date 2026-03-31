import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import {
  GET_SECURITY,
  GET_SECURITY_INFO,
  GET_STATIC_SECURITY_INFO,
  GET_SECURITY_TICK,
  GET_TIME_SERIES_BY_SECURITY,
  GET_TRADING_TRADABILITY,
  IS_SECURITY_BUYABLE,
} from '../../scalable/operations/securities.ts';
import { ISIN_RE } from './validate.ts';

const router = Router();

router.param('isin', (req, res, next, value: string) => {
  if (!ISIN_RE.test(value)) {
    res.status(400).json({ error: 'isin must be a 12-character alphanumeric string' });
    return;
  }
  next();
});

const ALL_TIMEFRAMES = [
  'TWO_DAYS',
  'ONE_WEEK',
  'ONE_MONTH',
  'THREE_MONTHS',
  'SIX_MONTHS',
  'YEAR_TO_DATE',
  'ONE_YEAR',
  'MAX',
];

// GET /securities/:isin
router.get('/:isin', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;

  const result = await graphqlRequest({
    operationName: 'getSecurity',
    query: GET_SECURITY,
    variables: { personId: session.personId, portfolioId: session.portfolioId, isin },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/info
router.get('/:isin/info', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;

  const result = await graphqlRequest({
    operationName: 'getSecurityInfo',
    query: GET_SECURITY_INFO,
    variables: { personId: session.personId, portfolioId: session.portfolioId, isin },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/static
router.get('/:isin/static', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;

  const result = await graphqlRequest({
    operationName: 'getStaticSecurityInfo',
    query: GET_STATIC_SECURITY_INFO,
    variables: { personId: session.personId, portfolioId: session.portfolioId, isin },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/tick
router.get('/:isin/tick', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;
  const source = req.query['source'] ? String(req.query['source']) : null;
  const includeYearToDate = req.query['includeYearToDate'] === 'true' ? true : undefined;

  const result = await graphqlRequest({
    operationName: 'getSecurityTick',
    query: GET_SECURITY_TICK,
    variables: {
      personId: session.personId,
      portfolioId: session.portfolioId,
      isin,
      source,
      includeYearToDate,
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/timeseries
router.get('/:isin/timeseries', requireSession, async (req, res) => {
  const { isin } = req.params;
  const timeframes = req.query['timeframes']
    ? String(req.query['timeframes']).split(',')
    : ALL_TIMEFRAMES;
  const includeYearToDate = req.query['includeYearToDate'] === 'true' ? true : undefined;

  const result = await graphqlRequest({
    operationName: 'getTimeSeriesBySecurity',
    query: GET_TIME_SERIES_BY_SECURITY,
    variables: { isin, timeframes, includeYearToDate },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/tradability
router.get('/:isin/tradability', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;

  const result = await graphqlRequest({
    operationName: 'getTradingTradability',
    query: GET_TRADING_TRADABILITY,
    variables: { personId: session.personId, portfolioId: session.portfolioId, isin },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

// GET /securities/:isin/buyable
router.get('/:isin/buyable', requireSession, async (req, res) => {
  const session = getSession()!;
  const { isin } = req.params;
  const custodianBanks = req.query['custodianBanks']
    ? String(req.query['custodianBanks']).split(',')
    : undefined;

  const result = await graphqlRequest({
    operationName: 'isSecurityBuyable',
    query: IS_SECURITY_BUYABLE,
    variables: { personId: session.personId, isin, custodianBanks },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

export default router;
