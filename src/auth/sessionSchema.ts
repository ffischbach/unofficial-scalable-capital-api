import { z } from 'zod';

export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

export const SessionSchema = z.object({
  cookies: z.array(CookieSchema),
  personId: z.string(),
  portfolioId: z.string(),
  savingsId: z.string().nullable(),
  authenticatedAt: z.number(),
  expiresAt: z.number(),
});
