import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import { MORE_TRANSACTIONS } from '../../scalable/operations/transactions.ts';

const router = Router();

// GET /transactions
router.get('/', requireSession, async (req, res) => {
  const session = getSession()!;
  const pageSize = req.query['pageSize'] ? Number(req.query['pageSize']) : 20;
  const cursor = req.query['cursor'] ? String(req.query['cursor']) : null;
  const isin = req.query['isin'] ? String(req.query['isin']) : undefined;
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

export default router;
