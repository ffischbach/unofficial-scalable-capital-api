import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.ts';
import { graphqlRequest } from '../../scalable/client.ts';
import type { GraphQLRequest } from '../../types.ts';

const router = Router();

// POST /proxy — raw GraphQL passthrough
router.post('/', requireSession, async (req, res) => {
  const body = req.body as Partial<GraphQLRequest>;

  if (!body.operationName || !body.query) {
    res.status(400).json({ error: 'Request body must include operationName and query.' });
    return;
  }

  const result = await graphqlRequest({
    operationName: body.operationName,
    query: body.query,
    variables: body.variables ?? {},
  });

  res.json(result);
});

export default router;
