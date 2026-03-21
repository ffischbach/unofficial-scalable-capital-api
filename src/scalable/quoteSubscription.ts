import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getSession } from '../auth/session.ts';
import { wsManager } from './wsManager.ts';
import { checkResponseShape } from './apiMonitor.ts';

const QUOTE_QUERY = /* GraphQL */ `
  subscription realTimeQuoteTicks(
    $isins: [String!]!
    $portfolioId: ID
    $source: MarketDataSource
    $includeYearToDate: Boolean
  ) {
    realTimeQuoteTicks(
      isins: $isins
      portfolioId: $portfolioId
      source: $source
      includeYearToDate: $includeYearToDate
    ) {
      id
      isin
      midPrice
      time
      currency
      bidPrice
      askPrice
      isOutdated
      timestampUtc {
        time
        epochMillisecond
      }
      performanceDate {
        date
      }
      performancesByTimeframe {
        timeframe
        performance
        simpleAbsoluteReturn
      }
    }
  }
`;

const QuoteTickSchema = z
  .object({
    id: z.string(),
    isin: z.string(),
    midPrice: z.number(),
    time: z.string(),
    currency: z.string(),
    bidPrice: z.number(),
    askPrice: z.number(),
    isOutdated: z.boolean(),
    timestampUtc: z.object({ time: z.string(), epochMillisecond: z.number() }),
    performanceDate: z.object({ date: z.string() }).nullable(),
    performancesByTimeframe: z.array(
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

export type QuoteTick = z.infer<typeof QuoteTickSchema>;

type QuoteListener = (tick: QuoteTick) => void;

class QuoteManager {
  private listenerIsins = new Map<QuoteListener, string[]>();
  private currentSubId: string | null = null;
  private currentIsins: string[] = [];

  subscribe(isins: string[], listener: QuoteListener): () => void {
    this.listenerIsins.set(listener, isins);
    this.syncSubscription();
    return () => {
      this.listenerIsins.delete(listener);
      if (this.listenerIsins.size === 0) {
        if (this.currentSubId) {
          wsManager.removeSub(this.currentSubId);
          this.currentSubId = null;
        }
        this.currentIsins = [];
      } else {
        this.syncSubscription();
      }
    };
  }

  private syncSubscription(): void {
    const newIsins = [...new Set([...this.listenerIsins.values()].flat())].sort();
    if (JSON.stringify(newIsins) === JSON.stringify(this.currentIsins)) return;
    this.currentIsins = newIsins;

    const session = getSession();
    if (!session) {
      console.warn('[quotes] No session — cannot subscribe');
      return;
    }

    const newId = randomUUID();
    const vars = {
      isins: newIsins,
      portfolioId: session.portfolioId,
      includeYearToDate: true,
    };
    const onData = (data: unknown) => {
      const raw = (data as { realTimeQuoteTicks?: unknown })?.realTimeQuoteTicks;
      if (!raw) return;
      void checkResponseShape('realTimeQuoteTicks', raw);
      const parsed = QuoteTickSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn('[API MONITOR] realTimeQuoteTicks schema mismatch:', parsed.error.message);
        return;
      }
      if (!parsed.data.isin) return;
      for (const [listener, listenerIsinList] of this.listenerIsins) {
        if (listenerIsinList.includes(parsed.data.isin)) listener(parsed.data);
      }
    };

    if (this.currentSubId) {
      wsManager.updateSub(
        this.currentSubId,
        newId,
        'realTimeQuoteTicks',
        QUOTE_QUERY,
        vars,
        onData,
      );
    } else {
      wsManager.addSub(newId, 'realTimeQuoteTicks', QUOTE_QUERY, vars, onData);
    }
    this.currentSubId = newId;
  }
}

export const quoteManager = new QuoteManager();
