import { Router } from 'express';
import { getSession, isSessionValid, clearSession, setSession, persistSession } from '../../auth/session.ts';
import { runPuppeteerLogin } from '../../auth/puppeteer-login.ts';
import { ensureSilentRefresh } from '../../scalable/client.ts';
import { SessionSchema } from '../../auth/sessionSchema.ts';

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

  const refreshed = await ensureSilentRefresh();
  if (!refreshed) {
    res.status(401).json({ error: 'Silent refresh failed — interactive /auth/login required.' });
    return;
  }

  const session = getSession()!;
  res.json({ message: 'Session refreshed.', expiresAt: session.expiresAt });
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

// POST /auth/import — accepts a session produced by a local `npm run
// login:remote` run, so completing 2FA never requires a display on this
// machine. Unlike the rest of /auth/*, this is NOT exempt from the gateway
// token check (see server/app.ts) — it lets a caller inject a fully
// authenticated session, which is a much bigger blast radius than
// login/logout/status/refresh.
router.post('/import', async (req, res) => {
  const parsed = SessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid session payload.', details: parsed.error.format() });
    return;
  }

  const session = parsed.data;
  if (!isSessionValid(session)) {
    res.status(400).json({ error: 'Session is already expired.' });
    return;
  }

  setSession(session);
  await persistSession(session);

  console.log('[auth] Session imported from remote login.');
  res.json({
    message: 'Session imported.',
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
