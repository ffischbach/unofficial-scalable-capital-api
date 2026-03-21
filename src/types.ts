// Zero runtime imports — pure types only

export type SameSiteValue = 'Strict' | 'Lax' | 'None';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number; // Unix seconds
  httpOnly: boolean;
  secure: boolean;
  sameSite?: SameSiteValue;
}

export interface Session {
  cookies: Cookie[];
  personId: string;
  portfolioId: string;
  savingsId: string | null;
  authenticatedAt: number;
  expiresAt: number;
}

export interface GraphQLRequest {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
}

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface GatewayConfig {
  port: number;
  token?: string;
}
