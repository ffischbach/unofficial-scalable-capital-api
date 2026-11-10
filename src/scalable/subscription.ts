import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSession } from '../auth/session.ts';
import { wsManager } from './wsManager.ts';
import { checkResponseShape } from './apiMonitor.ts';

const SUBSCRIPTION_QUERY = /* GraphQL */ `
  subscription RealTimeValuation($portfolioId: ID!) {
    realTimeValuation(portfolioId: $portfolioId) {
      id
      timestampUtc {
        time
        epochMillisecond
      }
      valuation
      securitiesValuation
      unrealisedReturn {
        absoluteUnrealisedReturn
        relativeUnrealisedReturn
      }
      cryptoValuation
      lastInventoryUpdateTimestampUtc {
        epochSecond
      }
      timeWeightedReturnByTimeframe {
        timeframe
        performance
        simpleAbsoluteReturn
      }
    }
  }
`;

const RealTimeValuationSchema = z
  .object({
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
      z
        .object({
          timeframe: z.string(),
          performance: z.number(),
          simpleAbsoluteReturn: z.number(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type RealTimeValuation = z.infer<typeof RealTimeValuationSchema>;

type Listener = (data: RealTimeValuation) => void;

/** How long a cached valuation is considered fresh for GET /portfolio. */
const VALUATION_CACHE_TTL_MS = 30_000;

/**
 * After a `fetchLatest` timeout the subscription is kept alive this long so a
 * late value still populates the cache for the next request, then released.
 * Without this the internal listener would leak and keep the WS open forever.
 */
const FETCH_LATEST_KEEPALIVE_MS = 60_000;

class SubscriptionManager {
  private listeners = new Set<Listener>();
  private subId: string | null = null;
  private lastValuation: RealTimeValuation | null = null;
  private lastReceivedAt: number | null = null;

  getLastValuation(): RealTimeValuation | null {
    return this.lastValuation;
  }

  fetchLatest(
    timeoutMs = 10_000,
    maxAgeMs = VALUATION_CACHE_TTL_MS,
  ): Promise<RealTimeValuation | null> {
    if (this.lastValuation && this.lastReceivedAt && Date.now() - this.lastReceivedAt < maxAgeMs) {
      return Promise.resolve(this.lastValuation);
    }
    return new Promise((resolve) => {
      let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
      const unsub = this.subscribe((val) => {
        clearTimeout(timer);
        clearTimeout(keepAliveTimer);
        unsub();
        resolve(val);
      });
      // On timeout: resolve null but keep the subscription alive for a grace
      // window so lastValuation gets populated for the next request — then
      // release it, otherwise the listener leaks and latches the manager into
      // a state where no later subscriber ever re-registers.
      const timer = setTimeout(() => {
        keepAliveTimer = setTimeout(unsub, FETCH_LATEST_KEEPALIVE_MS);
        resolve(null);
      }, timeoutMs);
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.ensureSubscribed();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.subId) {
        wsManager.removeSub(this.subId);
        this.subId = null;
      }
    };
  }

  /**
   * Registers the WS subscription unless one is already live.
   *
   * Checked against `wsManager` on every `subscribe()` rather than off the
   * listener count: a subscription can disappear underneath us (failed
   * re-auth) or never have been created (no session at the time), and a
   * listener-count trigger would then latch the stream silently dead.
   */
  private ensureSubscribed(): void {
    if (this.subId && wsManager.hasSub(this.subId)) return;

    const session = getSession();
    if (!session) {
      console.warn('[subscription] No session — cannot subscribe');
      this.subId = null;
      return;
    }

    const id = randomUUID();
    this.subId = id;
    wsManager.addSub(
      id,
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
      () => {
        if (this.subId === id) this.subId = null;
      },
    );
  }
}

export const subscriptionManager = new SubscriptionManager();
