import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { getSession } from '../auth/session.ts';

const WS_URL = 'wss://de.scalable.capital/broker/subscriptions';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const RECONNECT_DELAY_MS = 5_000;

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

export interface RealTimeValuation {
  id: string;
  timestampUtc: { time: string; epochMillisecond: number };
  valuation: number;
  securitiesValuation: number;
  unrealisedReturn: { absoluteUnrealisedReturn: number; relativeUnrealisedReturn: number };
  cryptoValuation: number;
  lastInventoryUpdateTimestampUtc: { epochSecond: number };
  timeWeightedReturnByTimeframe: Array<{
    timeframe: string;
    performance: number;
    simpleAbsoluteReturn: number;
  }>;
}

type Listener = (data: RealTimeValuation) => void;

interface GqlTransportMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

class SubscriptionManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subscriptionId = '';
  private reconnectTimer: NodeJS.Timeout | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  private connect(): void {
    const session = getSession();
    if (!session) {
      console.warn('[subscription] No session — skipping WebSocket connection');
      return;
    }

    const cookieHeader = session.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    console.log('[subscription] Connecting to Scalable WebSocket...');

    this.ws = new WebSocket(WS_URL, ['graphql-transport-ws'], {
      headers: {
        Cookie: cookieHeader,
        Origin: 'https://de.scalable.capital',
        'User-Agent': USER_AGENT,
      },
    });

    this.ws.on('open', () => {
      console.log('[subscription] Connected — sending connection_init');
      this.send({ type: 'connection_init', payload: {} });
    });

    this.ws.on('message', (raw) => this.handleMessage(raw.toString(), session.portfolioId));

    this.ws.on('close', (code) => {
      console.log(`[subscription] WebSocket closed (${code})`);
      this.ws = null;
      if (this.listeners.size > 0) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[subscription] WebSocket error:', err.message);
    });
  }

  private handleMessage(raw: string, portfolioId: string): void {
    let msg: GqlTransportMessage;
    try {
      msg = JSON.parse(raw) as GqlTransportMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'connection_ack':
        console.log('[subscription] connection_ack — subscribing');
        this.subscriptionId = randomUUID();
        this.send({
          id: this.subscriptionId,
          type: 'subscribe',
          payload: {
            operationName: 'RealTimeValuation',
            query: SUBSCRIPTION_QUERY,
            variables: { portfolioId },
          },
        });
        break;

      case 'next':
        if (msg.id !== this.subscriptionId) break;
        // eslint-disable-next-line no-case-declarations
        const valuation = (
          msg.payload as { data?: { realTimeValuation?: RealTimeValuation } }
        )?.data?.realTimeValuation;
        if (valuation) {
          for (const listener of this.listeners) listener(valuation);
        }
        break;

      case 'ping':
        this.send({ type: 'pong' });
        break;

      case 'error':
        console.error('[subscription] Subscription error:', JSON.stringify(msg.payload));
        break;

      case 'complete':
        console.log('[subscription] Subscription completed by server');
        this.scheduleReconnect();
        break;
    }
  }

  private send(msg: GqlTransportMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.send({ id: this.subscriptionId, type: 'complete' });
      this.ws.close();
      this.ws = null;
    }
    console.log('[subscription] Disconnected (no listeners)');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`[subscription] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0) this.connect();
    }, RECONNECT_DELAY_MS);
  }
}

export const subscriptionManager = new SubscriptionManager();
