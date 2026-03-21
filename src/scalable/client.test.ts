import { describe, it, expect } from 'vitest';
import { buildCookieHeader, buildHeaders, AuthenticationError } from './client.ts';
import type { Cookie } from '../types.ts';

function makeCookie(name: string, value: string): Cookie {
  return {
    name,
    value,
    domain: 'de.scalable.capital',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
  };
}

describe('buildCookieHeader', () => {
  it('returns empty string for empty array', () => {
    expect(buildCookieHeader([])).toBe('');
  });

  it('formats a single cookie', () => {
    expect(buildCookieHeader([makeCookie('a', '1')])).toBe('a=1');
  });

  it('joins multiple cookies with "; "', () => {
    expect(buildCookieHeader([makeCookie('a', '1'), makeCookie('b', '2')])).toBe('a=1; b=2');
  });
});

describe('buildHeaders', () => {
  const headers = buildHeaders('pid', 'cookie=x');

  it('includes required keys', () => {
    expect(headers).toHaveProperty('Content-Type');
    expect(headers).toHaveProperty('Cookie');
    expect(headers).toHaveProperty('Referer');
    expect(headers).toHaveProperty('x-scacap-features-enabled');
    expect(headers).toHaveProperty('Origin');
  });

  it('sets Content-Type to application/json', () => {
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sets Cookie to the provided cookie header', () => {
    expect(headers['Cookie']).toBe('cookie=x');
  });

  it('includes portfolioId in Referer', () => {
    expect(headers['Referer']).toContain('portfolioId=pid');
  });

  it('sets correct x-scacap-features-enabled value', () => {
    expect(headers['x-scacap-features-enabled']).toBe('CRYPTO_MULTI_ETP,UNIQUE_SECURITY_ID');
  });
});

describe('AuthenticationError', () => {
  it('is an instance of Error', () => {
    expect(new AuthenticationError()).toBeInstanceOf(Error);
  });

  it('has name "AuthenticationError"', () => {
    expect(new AuthenticationError().name).toBe('AuthenticationError');
  });

  it('default message mentions POST /auth/login', () => {
    expect(new AuthenticationError().message).toContain('POST /auth/login');
  });

  it('accepts a custom message', () => {
    expect(new AuthenticationError('custom').message).toBe('custom');
  });
});
