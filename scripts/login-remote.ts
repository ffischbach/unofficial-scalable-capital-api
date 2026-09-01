/**
 * Completes an interactive 2FA login on this machine (opens a headed
 * Chromium window, same as `npm run dev`'s /auth/login flow) and pushes the
 * resulting session straight to a remote deployment's POST /auth/import —
 * no manual copying of session.json required.
 *
 * Usage:
 *   npm run login:remote -- --server https://myserver:3141 --token my-secret-token
 *   npm run login:remote -- --server http://100.x.y.z:3141 --token my-secret-token --browser-profile .browser-profile
 */
import { parseArgs } from 'node:util';
import { configureBrowserProfile, runPuppeteerLogin } from '../src/auth/puppeteer-login.ts';

const { values } = parseArgs({
  options: {
    server: { type: 'string' },
    token: { type: 'string' },
    'browser-profile': { type: 'string' },
  },
});

const server = values.server as string | undefined;
const token = values.token as string | undefined;
const browserProfileDir = values['browser-profile'] as string | undefined;

if (!server) {
  console.error('Usage: npm run login:remote -- --server <url> [--token <token>] [--browser-profile <dir>]');
  process.exit(1);
}

const importUrl = new URL('/auth/import', server).toString();

configureBrowserProfile(browserProfileDir);

console.log('[login-remote] Starting local login flow...');
const session = await runPuppeteerLogin();

console.log(`[login-remote] Pushing session to ${importUrl}...`);
const res = await fetch(importUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Gateway-Token': token } : {}),
  },
  body: JSON.stringify(session),
});

const body = await res.json();

if (!res.ok) {
  console.error(`[login-remote] Import failed (${res.status}):`, body);
  process.exit(1);
}

console.log('[login-remote] Session imported successfully:', body);
