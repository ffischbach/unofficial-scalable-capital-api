import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import {
  OVERNIGHT_OVERVIEW,
  OVERNIGHT_TRANSACTIONS,
  type OvernightSavingsAccount,
} from '../../scalable/operations/savings.ts';

const router = Router();

// GET /savings — balance and interest overview
router.get('/', requireSession, async (_req, res) => {
  const session = getSession()!;
  if (!session.savingsId) {
    res.status(503).json({ error: 'No savings account found' });
    return;
  }

  const result = await graphqlRequest<{ account: { savingsAccount: OvernightSavingsAccount } }>({
    operationName: 'OvernightOverview',
    query: OVERNIGHT_OVERVIEW,
    variables: {
      accountId: session.personId,
      savingsAccountId: session.savingsId,
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }

  const account = result.data?.account?.savingsAccount;
  res.json({
    id: account?.id,
    totalAmount: account?.totalAmount,
    depositInterestRate: account?.depositInterestRate,
    nextPayoutDate: account?.nextPayoutDate,
    interests: account?.interests,
  });
});

// GET /savings/transactions — recent transactions
// Query param: ?limit=50 (default 50)
router.get('/transactions', requireSession, async (req, res) => {
  const session = getSession()!;
  if (!session.savingsId) {
    res.status(503).json({ error: 'No savings account found' });
    return;
  }

  const pageSize = req.query['limit'] ? Number(req.query['limit']) : 50;

  const result = await graphqlRequest<{ account: { savingsAccount: OvernightSavingsAccount } }>({
    operationName: 'OvernightOverviewPageData',
    query: OVERNIGHT_TRANSACTIONS,
    variables: {
      accountId: session.personId,
      savingsAccountId: session.savingsId,
      recentTransactionsInput: { pageSize },
    },
  });

  if (result.errors?.length) {
    res.status(502).json({ errors: result.errors });
    return;
  }

  const transactions = result.data?.account?.savingsAccount?.moreTransactions?.transactions ?? [];
  res.json({ transactions });
});

export default router;