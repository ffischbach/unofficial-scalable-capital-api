import { Router } from 'express';
import { getSession, isSessionValid, clearSession } from '../../auth/session.ts';
import { runPuppeteerLogin } from '../../auth/puppeteer-login.ts';

const router = Router();

// POST /auth/login — opens browser for interactive login
router.post('/login', async (_req, res) => {
  const existing = getSession();
  if (existing && isSessionValid(existing)) {
    res.json({
      message: 'Already authenticated.',
      personId: existing.personId,
      portfolioId: existing.portfolioId,
      expiresAt: existing.expiresAt,
    });
    return;
  }

  console.log('[auth] Starting login flow...');
  const session = await runPuppeteerLogin();
  res.json({
    message: 'Login successful.',
    personId: session.personId,
    portfolioId: session.portfolioId,
    expiresAt: session.expiresAt,
  });
});

// GET /auth/status — returns current authentication state
router.get('/status', (_req, res) => {
  const session = getSession();
  if (!session || !isSessionValid(session)) {
    res.json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    personId: session.personId,
    portfolioId: session.portfolioId,
    valuation: session.valuation,
    expiresAt: session.expiresAt,
  });
});

// DELETE /auth/logout — clears session
router.delete('/logout', async (_req, res) => {
  await clearSession();
  res.json({ message: 'Logged out.' });
});

export default router;
