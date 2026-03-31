import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted: MockWebSocket must be available before vi.mock() calls
// ---------------------------------------------------------------------------
const { getMockWs, resetWsTracking, MockWebSocket } = vi.hoisted(() => {
  type WsInstance = {
    readyState: number;
    handlers: Record<string, ((...a: unknown[]) => void)[]>;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on(e: string, h: (...a: unknown[]) => void): void;
    emit(e: string, ...a: unknown[]): void;
  };

  let _current: WsInstance | null = null;

  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    send = vi.fn();
    close: ReturnType<typeof vi.fn>;

    constructor() {
      this.close = vi.fn().mockImplementation((code = 1000) => {
        this.readyState = 3;
        this.emit('close', code);
      });
      _current = this as unknown as WsInstance;
    }

    on(event: string, h: (...a: unknown[]) => void) {
      (this.handlers[event] ??= []).push(h);
    }

    emit(event: string, ...args: unknown[]) {
      for (const h of this.handlers[event] ?? []) h(...args);
    }
  }

  return {
    getMockWs: () => _current,
    resetWsTracking: () => {
      _current = null;
    },
    MockWebSocket,
  };
});

vi.mock('ws', () => ({ default: MockWebSocket }));
vi.mock('../auth/session.ts', () => ({ getSession: vi.fn() }));
vi.mock('./client.ts', () => ({ ensureLogin: vi.fn() }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockSession = { cookies: [{ name: 'sid', value: 'abc' }], portfolioId: 'pid' };

function unauthErrorMsg(id = 'sub-1') {
  return JSON.stringify({
    type: 'error',
    id,
    payload: [{ extensions: { code: 'UNAUTHENTICATED' } }],
  });
}

/** Flushes two microtask queue levels (enough for one .then() callback to run). */
const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Normal subscription lifecycle
// ---------------------------------------------------------------------------
describe('wsManager — normal lifecycle', () => {
  let wsManager: Awaited<typeof import('./wsManager.ts')>['wsManager'];
  let getSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    resetWsTracking();

    const sessionMod = await import('../auth/session.ts');
    const wsMod = await import('./wsManager.ts');

    wsManager = wsMod.wsManager;
    getSession = vi.mocked(sessionMod.getSession as ReturnType<typeof vi.fn>);
    getSession.mockReturnValue(mockSession);
  });

  it('opens a WebSocket when the first subscription is added', () => {
    expect(getMockWs()).toBeNull();
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    expect(getMockWs()).not.toBeNull();
  });

  it('does not open a second WebSocket for additional subscriptions', () => {
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const firstWs = getMockWs();
    wsManager.addSub('sub-2', 'Test2', '{ test2 }', {}, vi.fn());
    expect(getMockWs()).toBe(firstWs);
  });

  it('sends subscribe message immediately when WS is already open', () => {
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));
    ws.send.mockClear();

    wsManager.addSub('sub-2', 'Test2', '{ test2 }', {}, vi.fn());

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"subscribe"'));
  });

  it('delivers next message data to the registered onData callback', () => {
    const onData = vi.fn();
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, onData);
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));

    ws.emit('message', JSON.stringify({
      type: 'next',
      id: 'sub-1',
      payload: { data: { value: 99 } },
    }));

    expect(onData).toHaveBeenCalledWith({ value: 99 });
  });

  it('does not deliver next message to unrelated subscriptions', () => {
    const onData1 = vi.fn();
    const onData2 = vi.fn();
    wsManager.addSub('sub-1', 'Op1', '{ op1 }', {}, onData1);
    wsManager.addSub('sub-2', 'Op2', '{ op2 }', {}, onData2);
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));

    ws.emit('message', JSON.stringify({
      type: 'next',
      id: 'sub-2',
      payload: { data: { x: 1 } },
    }));

    expect(onData1).not.toHaveBeenCalled();
    expect(onData2).toHaveBeenCalledWith({ x: 1 });
  });

  it('responds to ping with pong', () => {
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));
    ws.send.mockClear();

    ws.emit('message', JSON.stringify({ type: 'ping' }));

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });

  it('closes the WebSocket when the last subscription is removed', () => {
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));

    wsManager.removeSub('sub-1');

    expect(ws.close).toHaveBeenCalled();
  });

  it('does not close the WebSocket when other subscriptions remain', () => {
    wsManager.addSub('sub-1', 'Op1', '{ op1 }', {}, vi.fn());
    wsManager.addSub('sub-2', 'Op2', '{ op2 }', {}, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));

    wsManager.removeSub('sub-1');

    expect(ws.close).not.toHaveBeenCalled();
  });

  it('schedules reconnect on non-auth close when subscriptions remain', async () => {
    vi.useFakeTimers();
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const firstWs = getMockWs()!;
    firstWs.emit('open');
    firstWs.emit('message', JSON.stringify({ type: 'connection_ack' }));

    firstWs.emit('close', 1001); // going-away, not auth-related
    await flushMicrotasks();

    // No new WS yet — reconnect is scheduled but timer hasn't fired
    expect(getMockWs()).toBe(firstWs); // mock still tracks the last-created instance

    vi.advanceTimersByTime(5_001);
    // A new WS is created by the reconnect timer
    expect(getMockWs()).not.toBe(firstWs);

    vi.useRealTimers();
  });

  it('does not reconnect when all subscriptions were removed before the reconnect fires', async () => {
    vi.useFakeTimers();
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const firstWs = getMockWs()!;
    firstWs.emit('open');
    firstWs.emit('message', JSON.stringify({ type: 'connection_ack' }));

    // Simulate unexpected server-side close (not auth-related)
    firstWs.readyState = 3; // CLOSED so removeSub's send() is a no-op
    firstWs.emit('close', 1001);
    await flushMicrotasks();

    wsManager.removeSub('sub-1');

    vi.advanceTimersByTime(5_001);
    // No new WS was created — subs were empty when the timer fired
    expect(getMockWs()).toBe(firstWs);

    vi.useRealTimers();
  });

  it('updates subscription variables and re-subscribes with updateSub', () => {
    wsManager.addSub('sub-1', 'Op', '{ op }', { v: 1 }, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));
    ws.send.mockClear();

    const newOnData = vi.fn();
    wsManager.updateSub('sub-1', 'sub-2', 'Op', '{ op }', { v: 2 }, newOnData);

    const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
    // First call should complete the old subscription
    expect(calls[0]).toMatchObject({ type: 'complete', id: 'sub-1' });
    // Second call should subscribe with the new id
    expect(calls[1]).toMatchObject({ type: 'subscribe', id: 'sub-2' });
  });

  it('does not open WebSocket when there is no session', () => {
    getSession.mockReturnValue(null);
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    expect(getMockWs()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Re-auth on session expiry
// ---------------------------------------------------------------------------
describe('wsManager — re-auth on session expiry', () => {
  let wsManager: Awaited<typeof import('./wsManager.ts')>['wsManager'];
  let ensureLogin: ReturnType<typeof vi.fn>;
  let getSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Clear mock call counts first, then reset module registry for a fresh singleton.
    vi.clearAllMocks();
    vi.resetModules();
    resetWsTracking();

    // Import in dependency order so wsManager gets the already-cached mocks.
    const sessionMod = await import('../auth/session.ts');
    const clientMod = await import('./client.ts');
    const wsMod = await import('./wsManager.ts');

    wsManager = wsMod.wsManager;
    getSession = vi.mocked(sessionMod.getSession as ReturnType<typeof vi.fn>);
    ensureLogin = vi.mocked(clientMod.ensureLogin as ReturnType<typeof vi.fn>);

    getSession.mockReturnValue(mockSession);
    ensureLogin.mockResolvedValue(undefined);
  });

  /** Adds a sub, opens the WS, and receives connection_ack. Returns the active mock WS. */
  function connectAndAck() {
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, vi.fn());
    const ws = getMockWs()!;
    ws.emit('open');
    ws.emit('message', JSON.stringify({ type: 'connection_ack' }));
    return ws;
  }

  // --- UNAUTHENTICATED error message path ---

  it('calls ensureLogin when an UNAUTHENTICATED error is received', async () => {
    const ws = connectAndAck();
    ws.emit('message', unauthErrorMsg());
    await flushMicrotasks();
    expect(ensureLogin).toHaveBeenCalledOnce();
  });

  it('creates a new WebSocket after ensureLogin resolves', async () => {
    const firstWs = connectAndAck();
    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();
    expect(getMockWs()).not.toBe(firstWs);
  });

  it('preserves subscriptions during re-auth so they re-register on reconnect', async () => {
    // Replace the default no-op onData with a spy.
    const onData = vi.fn();
    wsManager.addSub('sub-1', 'Test', '{ test }', {}, onData);
    const firstWs = getMockWs()!;
    firstWs.emit('open');
    firstWs.emit('message', JSON.stringify({ type: 'connection_ack' }));

    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    // Second WS connects and acks → re-subscribes → data arrives
    const secondWs = getMockWs()!;
    secondWs.emit('open');
    secondWs.emit('message', JSON.stringify({ type: 'connection_ack' }));
    secondWs.emit('message', JSON.stringify({
      type: 'next',
      id: 'sub-1',
      payload: { data: { result: 42 } },
    }));

    expect(onData).toHaveBeenCalledWith({ result: 42 });
  });

  it('re-subscribes on the new connection after re-auth', async () => {
    const firstWs = connectAndAck();
    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    const secondWs = getMockWs()!;
    secondWs.emit('open');
    secondWs.emit('message', JSON.stringify({ type: 'connection_ack' }));

    expect(secondWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"subscribe"'),
    );
  });

  // --- 4401 close-code path ---

  it('calls ensureLogin when the server closes with code 4401', async () => {
    connectAndAck();
    // Simulate a server-initiated close with code 4401 (graphql-transport-ws unauthorized).
    getMockWs()!.emit('close', 4401);
    await flushMicrotasks();
    expect(ensureLogin).toHaveBeenCalledOnce();
  });

  it('creates a new WebSocket after 4401 and ensureLogin resolves', async () => {
    const firstWs = connectAndAck();
    firstWs.emit('close', 4401);
    await flushMicrotasks();
    expect(getMockWs()).not.toBe(firstWs);
  });

  // --- loop-guard: authRetried ---

  it('does not call ensureLogin a second time if the reconnected WS is also rejected', async () => {
    // First WS: UNAUTHENTICATED → re-login → second WS created (authRetried = true).
    const firstWs = connectAndAck();
    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    // Second WS: server immediately closes with 4401 before connection_ack.
    // authRetried is still true (no ack arrived to reset it), so we give up.
    getMockWs()!.emit('close', 4401);
    await flushMicrotasks();

    expect(ensureLogin).toHaveBeenCalledOnce();
  });

  it('clears subscriptions after the second consecutive auth failure', async () => {
    const firstWs = connectAndAck();
    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    // Second WS also immediately fails (4401, no ack) → subs are cleared.
    getMockWs()!.emit('close', 4401);
    await flushMicrotasks();

    // Subs were cleared: addSub now triggers a brand-new connection.
    const wsBefore = getMockWs();
    wsManager.addSub('sub-new', 'Test', '{ test }', {}, vi.fn());
    expect(getMockWs()).not.toBe(wsBefore);
  });

  // --- re-login failure ---

  it('clears subscriptions when ensureLogin rejects', async () => {
    ensureLogin.mockRejectedValue(new Error('login failed'));

    const ws = connectAndAck();
    ws.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    const wsBefore = getMockWs();
    wsManager.addSub('sub-new', 'Test', '{ test }', {}, vi.fn());
    expect(getMockWs()).not.toBe(wsBefore);
  });

  // --- normal (non-auth) close ---

  it('does not call ensureLogin on a normal close code', async () => {
    connectAndAck();
    getMockWs()!.emit('close', 1001); // going-away close, not auth-related
    await flushMicrotasks();
    expect(ensureLogin).not.toHaveBeenCalled();
  });

  // --- authRetried reset ---

  it('resets authRetried after connection_ack so a later expiry triggers a fresh re-login', async () => {
    // First auth failure → re-login → second WS.
    const firstWs = connectAndAck();
    firstWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    // Second WS successfully connects and acks → authRetried is reset to false.
    const secondWs = getMockWs()!;
    secondWs.emit('open');
    secondWs.emit('message', JSON.stringify({ type: 'connection_ack' }));

    // Second UNAUTHENTICATED on the healthy connection → should trigger re-login again.
    secondWs.emit('message', unauthErrorMsg());
    await flushMicrotasks();

    expect(ensureLogin).toHaveBeenCalledTimes(2);
  });
});
