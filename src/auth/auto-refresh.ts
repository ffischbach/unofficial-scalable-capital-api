import { getSession } from './session.ts';
import { ensureSilentRefresh } from '../scalable/client.ts';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // refresh when < 2h left

async function checkAndRefresh(): Promise<void> {
  try {
    const session = getSession();
    if (!session) return;
    if (session.expiresAt - Date.now() >= REFRESH_THRESHOLD_MS) return;

    console.log('[auto-refresh] Session nearing expiry — attempting silent refresh...');
    const refreshed = await ensureSilentRefresh();
    if (refreshed) {
      console.log('[auto-refresh] Session silently refreshed.');
    } else {
      console.warn('[auto-refresh] Silent refresh failed — will rely on next request to re-login.');
    }
  } catch (err) {
    console.error('[auto-refresh] Unexpected error during refresh check:', err);
  }
}

export function startAutoRefresh(): NodeJS.Timeout {
  return setInterval(() => {
    void checkAndRefresh();
  }, CHECK_INTERVAL_MS);
}
