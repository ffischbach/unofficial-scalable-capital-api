import WebSocket from 'ws';
import { getSession } from '../auth/session.ts';

const WS_URL = 'wss://de.scalable.capital/broker/subscriptions';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const RECONNECT_DELAY_MS = 5_000;

interface RegisteredSub {
  operationName: string;
  query: string;
  variables: Record<string, unknown>;
  onData: (data: unknown) => void;
}

interface GqlTransportMessage {
  type: string;
  id?: string;
  payload?: unknown;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private subs = new Map<string, RegisteredSub>();
  private reconnectTimer: NodeJS.Timeout | null = null;

  addSub(
    id: string,
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    onData: (data: unknown) => void,
  ): void {
    this.subs.set(id, { operationName, query, variables, onData });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(id);
    } else if (!this.ws) {
      this.connect();
    }
  }

  removeSub(id: string): void {
    if (this.subs.has(id)) {
      this.send({ id, type: 'complete' });
      this.subs.delete(id);
    }
    if (this.subs.size === 0) {
      this.disconnect();
    }
  }

  updateSub(
    oldId: string,
    newId: string,
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    onData: (data: unknown) => void,
  ): void {
    this.send({ id: oldId, type: 'complete' });
    this.subs.delete(oldId);
    this.subs.set(newId, { operationName, query, variables, onData });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(newId);
    }
  }

  private connect(): void {
    const session = getSession();
    if (!session) {
      console.warn('[wsManager] No session — skipping WebSocket connection');
      return;
    }

    const cookieHeader = session.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    console.log('[wsManager] Connecting to Scalable WebSocket...');

    this.ws = new WebSocket(WS_URL, ['graphql-transport-ws'], {
      headers: {
        Cookie: cookieHeader,
        Origin: 'https://de.scalable.capital',
        'User-Agent': USER_AGENT,
      },
    });

    this.ws.on('open', () => {
      console.log('[wsManager] Connected — sending connection_init');
      this.send({ type: 'connection_init', payload: {} });
    });

    this.ws.on('message', (raw) => this.handleMessage(raw.toString()));

    this.ws.on('close', (code) => {
      console.log(`[wsManager] WebSocket closed (${code})`);
      this.ws = null;
      if (this.subs.size > 0) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[wsManager] WebSocket error:', err.message);
    });
  }

  private handleMessage(raw: string): void {
    let msg: GqlTransportMessage;
    try {
      msg = JSON.parse(raw) as GqlTransportMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'connection_ack':
        console.log('[wsManager] connection_ack — subscribing all');
        for (const id of this.subs.keys()) {
          this.sendSubscribe(id);
        }
        break;

      case 'next':
        if (msg.id) {
          const sub = this.subs.get(msg.id);
          if (sub) {
            sub.onData((msg.payload as { data?: unknown })?.data);
          }
        }
        break;

      case 'ping':
        this.send({ type: 'pong' });
        break;

      case 'error': {
        console.error('[wsManager] Subscription error for', msg.id, ':', JSON.stringify(msg.payload));
        const errors = msg.payload as Array<{ extensions?: { code?: string } }> | undefined;
        if (errors?.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) {
          console.warn('[wsManager] Session expired — closing WebSocket to reconnect with fresh cookies');
          this.ws?.close();
        }
        break;
      }

      case 'complete':
        console.log('[wsManager] Subscription completed by server for', msg.id);
        break;
    }
  }

  private sendSubscribe(id: string): void {
    const sub = this.subs.get(id);
    if (!sub || this.ws?.readyState !== WebSocket.OPEN) return;
    this.send({
      id,
      type: 'subscribe',
      payload: {
        operationName: sub.operationName,
        query: sub.query,
        variables: sub.variables,
      },
    });
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
      for (const id of this.subs.keys()) {
        this.send({ id, type: 'complete' });
      }
      this.ws.close();
      this.ws = null;
    }
    console.log('[wsManager] Disconnected (no subscriptions)');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.log(`[wsManager] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subs.size > 0) this.connect();
    }, RECONNECT_DELAY_MS);
  }
}

export const wsManager = new WebSocketManager();
