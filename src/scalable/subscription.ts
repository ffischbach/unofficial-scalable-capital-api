import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSession } from '../auth/session.ts';
import { wsManager } from './wsManager.ts';
import { checkResponseShape } from './apiMonitor.ts';

const SUBSCRIPTION_QUERY = /* GraphQL */ `
  subscription RealTimeValuation($portfolioId: ID!) {
    realTimeValuation(portfolioId: $portfolioId) {
      id
      timestampUtc { time epochMillisecond }
      valuation
      securitiesValuation
      unrealisedReturn { absoluteUnrealisedReturn relativeUnrealisedReturn }
      cryptoValuation
      lastInventoryUpdateTimestampUtc { epochSecond }
      timeWeightedReturnByTimeframe { timeframe performance simpleAbsoluteReturn }
    }
  }
`;

const RealTimeValuationSchema = z.object({
  id: z.string(),
  timestampUtc: z.object({ time: z.string(), epochMillisecond: z.number() }),
  valuation: z.number(),
  securitiesValuation: z.number(),
  unrealisedReturn: z.object({
    absoluteUnrealisedReturn: z.number(),
    relativeUnrealisedReturn: z.number(),
  }),
  cryptoValuation: z.number(),
  lastInventoryUpdateTimestampUtc: z.object({ epochSecond: z.number() }),
  timeWeightedReturnByTimeframe: z.array(
    z.object({ timeframe: z.string(), performance: z.number(), simpleAbsoluteReturn: z.number() }).passthrough(),
  ),
}).passthrough();

export type RealTimeValuation = z.infer<typeof RealTimeValuationSchema>;

type Listener = (data: RealTimeValuation) => void;

/** How long a cached valuation is considered fresh for GET /portfolio. */
const VALUATION_CACHE_TTL_MS = 30_000;

class SubscriptionManager {
  private listeners = new Set<Listener>();
  private subId: string | null = null;
  private lastValuation: RealTimeValuation | null = null;
  private lastReceivedAt: number | null = null;

  getLastValuation(): RealTimeValuation | null {
    return this.lastValuation;
  }

  fetchLatest(timeoutMs = 10_000, maxAgeMs = VALUATION_CACHE_TTL_MS): Promise<RealTimeValuation | null> {
    if (this.lastValuation && this.lastReceivedAt && Date.now() - this.lastReceivedAt < maxAgeMs) {
      return Promise.resolve(this.lastValuation);
    }
    return new Promise((resolve) => {
      const unsub = this.subscribe((val) => {
        clearTimeout(timer);
        unsub();
        resolve(val);
      });
      // On timeout: resolve null but keep the subscription alive so the WS
      // stays connected and lastValuation gets populated for the next request.
      const timer = setTimeout(() => resolve(null), timeoutMs);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.subId = randomUUID();
      const session = getSession();
      if (!session) {
        console.warn('[subscription] No session — cannot subscribe');
        return () => {
          this.listeners.delete(listener);
        };
      }
      wsManager.addSub(
        this.subId,
        'RealTimeValuation',
        SUBSCRIPTION_QUERY,
        { portfolioId: session.portfolioId },
        (data) => {
          const raw = (data as { realTimeValuation?: unknown })?.realTimeValuation;
          if (!raw) return;
          void checkResponseShape('RealTimeValuation', raw);
          const parsed = RealTimeValuationSchema.safeParse(raw);
          if (!parsed.success) {
            console.warn('[API MONITOR] realTimeValuation schema mismatch:', parsed.error.message);
            return;
          }
          this.lastValuation = parsed.data;
          this.lastReceivedAt = Date.now();
          for (const l of this.listeners) l(parsed.data);
        },
      );
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.subId) {
        wsManager.removeSub(this.subId);
        this.subId = null;
      }
    };
  }
}

export const subscriptionManager = new SubscriptionManager();
