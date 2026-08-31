import { getSession, setSession, persistSession } from './session.ts';
import { attemptSilentRefresh } from './silent-refresh.ts';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // refresh when < 2h left

async function checkAndRefresh(): Promise<void> {
  const session = getSession();
  if (!session) return;
  if (session.expiresAt - Date.now() >= REFRESH_THRESHOLD_MS) return;

  console.log('[auto-refresh] Session nearing expiry — attempting silent refresh...');
  const refreshed = await attemptSilentRefresh(session);
  if (!refreshed) {
    console.warn('[auto-refresh] Silent refresh failed — will rely on next request to re-login.');
    return;
  }

  setSession(refreshed);
  await persistSession(refreshed);
  console.log('[auto-refresh] Session silently refreshed.');
}

export function startAutoRefresh(): NodeJS.Timeout {
  return setInterval(() => {
    void checkAndRefresh();
  }, CHECK_INTERVAL_MS);
}
