import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import { MORE_TRANSACTIONS, TRANSACTION_DETAILS } from '../../scalable/operations/transactions.ts';
import { ISIN_RE } from './validate.ts';

const router = Router();

// GET /transactions
router.get('/', requireSession, async (req, res) => {
  const session = getSession()!;
  const rawPageSize = req.query['pageSize'];
  const pageSize = rawPageSize !== undefined ? Number(rawPageSize) : 20;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    res.status(400).json({ error: 'pageSize must be an integer between 1 and 200' });
    return;
  }

  const cursor = req.query['cursor'] ? String(req.query['cursor']) : null;

  const rawIsin = req.query['isin'];
  const isin = rawIsin !== undefined ? String(rawIsin) : undefined;
  if (isin !== undefined && !ISIN_RE.test(isin)) {
    res.status(400).json({ error: 'isin must be a 12-character alphanumeric string' });
    return;
  }
  const searchTerm = req.query['searchTerm'] ? String(req.query['searchTerm']) : '';
  const type = req.query['type'] ? String(req.query['type']).split(',') : [];
  const status = req.query['status'] ? String(req.query['status']).split(',') : [];

  const result = await graphqlRequest({
    operationName: 'moreTransactions',
    query: MORE_TRANSACTIONS,
    variables: {
      personId: session.personId,
      portfolioId: session.portfolioId,
      input: { pageSize, cursor, isin, searchTerm, type, status },
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  res.json(result.data);
});

const TRANSACTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// GET /transactions/:id
router.get('/:id', requireSession, async (req, res) => {
  const session = getSession()!;
  const { id } = req.params;

  if (!TRANSACTION_ID_RE.test(String(id))) {
    res.status(400).json({ error: 'Invalid transaction id.' });
    return;
  }

  const result = await graphqlRequest({
    operationName: 'getTransactionDetails',
    query: TRANSACTION_DETAILS,
    variables: {
      personId: session.personId,
      portfolioId: session.portfolioId,
      transactionId: id,
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }
  const data = result.data as { account?: { brokerPortfolio?: { transactionDetails?: unknown } } };
  if (!data?.account?.brokerPortfolio?.transactionDetails) {
    res.status(404).json({ error: 'Transaction not found.' });
    return;
  }
  res.json(result.data);
});

export default router;
