import { getSession, isSessionValid } from '../auth/session.ts';
import { runPuppeteerLogin } from '../auth/puppeteer-login.ts';
import type { Cookie, GraphQLRequest, GraphQLResponse } from '../types.ts';
import { checkResponseShape } from './apiMonitor.ts';

const GRAPHQL_URL = 'https://de.scalable.capital/broker/api/data';

let loginInProgress: Promise<void> | null = null;

async function ensureLogin(): Promise<void> {
  if (loginInProgress) {
    await loginInProgress;
    return;
  }
  loginInProgress = runPuppeteerLogin().then(() => {
    loginInProgress = null;
  }, (err) => {
    loginInProgress = null;
    throw err;
  });
  await loginInProgress;
}

const USER_AGENT =
  'unofficial-sc-api/0.1.0 (https://github.com/ffischbach/unofficial-scalable-capital-api)';

export class AuthenticationError extends Error {
  constructor(message = 'Not authenticated. POST /auth/login first.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export function buildCookieHeader(cookies: Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export function buildHeaders(portfolioId: string, cookieHeader: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
    Referer: `https://de.scalable.capital/broker/transactions?portfolioId=${portfolioId}`,
    'x-scacap-features-enabled': 'CRYPTO_MULTI_ETP,UNIQUE_SECURITY_ID',
    Origin: 'https://de.scalable.capital',
    'User-Agent': USER_AGENT,
  };
}

const FETCH_TIMEOUT_MS = 30_000;

async function executeRequest<T>(
  body: GraphQLRequest,
  portfolioId: string,
  cookieHeader: string,
): Promise<GraphQLResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: buildHeaders(portfolioId, cookieHeader),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const status = response.status;
    const text = await response.text().catch(() => '');
    throw Object.assign(new Error(`GraphQL request failed: ${status} ${text}`), { status });
  }

  return response.json() as Promise<GraphQLResponse<T>>;
}

export async function graphqlRequest<T>(
  body: GraphQLRequest,
  retried = false,
): Promise<GraphQLResponse<T>> {
  const session = getSession();
  if (!session) {
    throw new AuthenticationError();
  }

  if (!isSessionValid(session)) {
    if (retried) throw new AuthenticationError('Session expired and re-login failed.');
    console.log('[client] Session expired — triggering re-login...');
    await ensureLogin();
    return graphqlRequest<T>(body, true);
  }

  const cookieHeader = buildCookieHeader(session.cookies);

  try {
    const result = await executeRequest<T>(body, session.portfolioId, cookieHeader);
    void checkResponseShape(body.operationName, result.data);
    return result;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if ((status === 401 || status === 403) && !retried) {
      console.log(`[client] Got ${status} — triggering re-login...`);
      await ensureLogin();
      return graphqlRequest<T>(body, true);
    }
    throw err;
  }
}
