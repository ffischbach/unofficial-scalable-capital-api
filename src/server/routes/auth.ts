import { Router } from 'express';
import { getSession, isSessionValid, clearSession, setSession, persistSession } from '../../auth/session.ts';
import { runPuppeteerLogin } from '../../auth/puppeteer-login.ts';
import { attemptSilentRefresh } from '../../auth/silent-refresh.ts';

const router = Router();

// POST /auth/login — opens browser for interactive login
router.post('/login', async (_req, res) => {
  const existing = getSession();
  if (existing && isSessionValid(existing)) {
    res.json({
      message: 'Already authenticated.',
      personId: existing.personId,
      portfolioId: existing.portfolioId,
      savingsId: existing.savingsId,
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
    savingsId: session.savingsId,
    expiresAt: session.expiresAt,
  });
});

// POST /auth/refresh — attempts a silent (headless) session refresh
router.post('/refresh', async (_req, res) => {
  const existing = getSession();
  if (!existing) {
    res.status(400).json({ error: 'No session to refresh.' });
    return;
  }

  const refreshed = await attemptSilentRefresh(existing);
  if (!refreshed) {
    res.status(401).json({ error: 'Silent refresh failed — interactive /auth/login required.' });
    return;
  }

  setSession(refreshed);
  await persistSession(refreshed);
  res.json({ message: 'Session refreshed.', expiresAt: refreshed.expiresAt });
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
    savingsId: session.savingsId,
    expiresAt: session.expiresAt,
  });
});

// DELETE /auth/logout — clears session
router.delete('/logout', async (_req, res) => {
  await clearSession();
  res.json({ message: 'Logged out.' });
});

export default router;
