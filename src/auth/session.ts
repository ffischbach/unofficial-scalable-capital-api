import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { SessionSchema } from './sessionSchema.ts';
import type { Cookie, Session } from '../types.ts';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ESM-safe project root resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
// Overridable so Docker deployments can point this at a mounted directory
// (bind-mounting the single file would break the atomic rename below with
// EXDEV, since the mount point and the tmp file would sit on different
// filesystems from the container's point of view).
const SESSION_FILE = process.env.SESSION_FILE_PATH
  ? path.resolve(process.env.SESSION_FILE_PATH)
  : path.join(PROJECT_ROOT, 'session.json');

let currentSession: Session | null = null;

export function getSession(): Session | null {
  return currentSession;
}

export function isSessionValid(session: Session): boolean {
  return Date.now() < session.expiresAt;
}

export async function loadSessionFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    const parsed = SessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[session] session.json failed validation — ignoring.', parsed.error.format());
      return;
    }
    const session: Session = parsed.data;
    currentSession = session;
    if (!isSessionValid(session)) {
      console.log('[session] Found session.json but it has expired — keeping it for a silent-refresh attempt.');
      return;
    }
    const expiresIn = Math.round((session.expiresAt - Date.now()) / 1000 / 60);
    console.log(`[session] Restored session from disk (expires in ~${expiresIn} minutes).`);
    if (expiresIn < 30) {
      console.warn(`[session] Warning: session expires in ~${expiresIn} minutes — re-login soon.`);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[session] No session.json found — starting unauthenticated.');
    } else {
      console.warn('[session] Failed to load session.json:', err);
    }
  }
}

export async function persistSession(session: Session): Promise<void> {
  const tmpFile = `${SESSION_FILE}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(session, null, 2), { mode: 0o600 });
    await fs.rename(tmpFile, SESSION_FILE);
    console.log('[session] Session persisted to disk.');
  } catch (err) {
    console.error('[session] Failed to persist session:', err);
    // Attempt to clean up tmp file
    try {
      await fs.unlink(tmpFile);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function createSession(
  cookies: Cookie[],
  personId: string,
  portfolioId: string,
  savingsId: string | null,
): Session {
  const now = Date.now();
  const validCookieExpiries = cookies.filter((c) => c.expires > 0).map((c) => c.expires * 1000); // Unix seconds → ms
  const minCookieExpiry =
    validCookieExpiries.length > 0 ? Math.min(...validCookieExpiries) : Infinity;
  const expiresAt = Math.min(now + SESSION_TTL_MS, minCookieExpiry);
  return {
    cookies,
    personId,
    portfolioId,
    savingsId,
    authenticatedAt: now,
    expiresAt,
  };
}

export async function clearSession(): Promise<void> {
  currentSession = null;
  try {
    await fs.unlink(SESSION_FILE);
    console.log('[session] Session cleared.');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[session] Could not delete session.json:', err);
    }
  }
}

export function setSession(session: Session): void {
  currentSession = session;
}
