import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { getSession } from '../../auth/session.ts';
import { graphqlRequest, buildCookieHeader, FETCH_TIMEOUT_MS } from '../../scalable/client.ts';
import { MORE_TRANSACTIONS, TRANSACTION_DETAILS } from '../../scalable/operations/transactions.ts';
import { ISIN_RE } from './validate.ts';

const DOWNLOAD_BASE_URL = 'https://de.scalable.capital/broker/api/download';

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LABEL_RE = /^[A-Za-z0-9 _-]{1,100}$/;

// GET /transactions/documents/:id — proxy-download a transaction document PDF
// Optional query params to construct the download path: date, label, isin
//   date:  lastEventDateTime date portion (e.g. "2026-03-26")
//   label: document label (e.g. "Kosteninformation")
//   isin:  security ISIN (e.g. "IE00B3RBWM25")
// All three must be supplied together; if omitted the document id is used as the path segment.
router.get('/documents/:id', requireSession, async (req, res) => {
  const documentId = String(req.params['id']);

  if (!TRANSACTION_ID_RE.test(documentId)) {
    res.status(400).json({ error: 'Invalid document id.' });
    return;
  }

  const date = req.query['date'] ? String(req.query['date']) : undefined;
  const label = req.query['label'] ? String(req.query['label']) : undefined;
  const isin = req.query['isin'] ? String(req.query['isin']) : undefined;

  const hasAll = date !== undefined && label !== undefined && isin !== undefined;
  const hasAny = date !== undefined || label !== undefined || isin !== undefined;
  if (hasAny && !hasAll) {
    res.status(400).json({ error: 'Provide all three of date, label, and isin, or none of them.' });
    return;
  }
  if (date !== undefined && !DATE_RE.test(date)) {
    res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
    return;
  }
  if (label !== undefined && !LABEL_RE.test(label)) {
    res.status(400).json({ error: 'label contains invalid characters.' });
    return;
  }
  if (isin !== undefined && !ISIN_RE.test(isin)) {
    res.status(400).json({ error: 'isin must be a 12-character alphanumeric string.' });
    return;
  }

  const slug = hasAll ? `${date}-${label}-${isin}` : documentId;
  const session = getSession()!;
  const cookieHeader = buildCookieHeader(session.cookies);
  const url = `${DOWNLOAD_BASE_URL}/${encodeURIComponent(slug)}?id=${encodeURIComponent(documentId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        Cookie: cookieHeader,
        Referer: `https://de.scalable.capital/broker/transactions?portfolioId=${session.portfolioId}`,
        Origin: 'https://de.scalable.capital',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
    return;
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const contentDisposition = upstream.headers.get('content-disposition');
  res.setHeader('Content-Type', contentType);
  if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

  const buffer = await upstream.arrayBuffer();
  res.send(Buffer.from(buffer));
});

export default router;
