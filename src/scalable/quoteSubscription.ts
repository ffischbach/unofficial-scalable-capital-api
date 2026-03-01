import { randomUUID } from 'node:crypto';
import { getSession } from '../auth/session.ts';
import { wsManager } from './wsManager.ts';

const QUOTE_QUERY = /* GraphQL */ `
  subscription realTimeQuoteTicks($isins: [String!]!, $portfolioId: ID, $includeYearToDate: Boolean) {
    realTimeQuoteTicks(isins: $isins portfolioId: $portfolioId includeYearToDate: $includeYearToDate) {
      id isin midPrice time currency bidPrice askPrice isOutdated
      timestampUtc { time epochMillisecond }
      performanceDate { date }
      performancesByTimeframe { timeframe performance simpleAbsoluteReturn }
    }
  }
`;

export interface QuoteTick {
  id: string;
  isin: string;
  midPrice: number;
  time: string;
  currency: string;
  bidPrice: number;
  askPrice: number;
  isOutdated: boolean;
  timestampUtc: { time: string; epochMillisecond: number };
  performanceDate: { date: string } | null;
  performancesByTimeframe: Array<{ timeframe: string; performance: number; simpleAbsoluteReturn: number }>;
}

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
      const ticks = (data as { realTimeQuoteTicks?: QuoteTick[] })?.realTimeQuoteTicks;
      if (!Array.isArray(ticks)) return;
      for (const tick of ticks) {
        for (const [listener, listenerIsinList] of this.listenerIsins) {
          if (listenerIsinList.includes(tick.isin)) listener(tick);
        }
      }
    };

    if (this.currentSubId) {
      wsManager.updateSub(this.currentSubId, newId, 'realTimeQuoteTicks', QUOTE_QUERY, vars, onData);
    } else {
      wsManager.addSub(newId, 'realTimeQuoteTicks', QUOTE_QUERY, vars, onData);
    }
    this.currentSubId = newId;
  }
}

export const quoteManager = new QuoteManager();
