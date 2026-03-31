import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted: stable mock object for wsManager across vi.resetModules() calls
// ---------------------------------------------------------------------------
const { mockWsManager } = vi.hoisted(() => ({
  mockWsManager: {
    addSub: vi.fn(),
    removeSub: vi.fn(),
    updateSub: vi.fn(),
  },
}));

vi.mock('./wsManager.ts', () => ({ wsManager: mockWsManager }));
vi.mock('../auth/session.ts', () => ({ getSession: vi.fn() }));
vi.mock('./apiMonitor.ts', () => ({ checkResponseShape: vi.fn() }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockSession = {
  portfolioId: 'pid-123',
  cookies: [{ name: 'sid', value: 'abc' }],
};

const validValuation = {
  id: 'v1',
  timestampUtc: { time: '2026-01-01T00:00:00Z', epochMillisecond: 1_000_000 },
  valuation: 12_345.67,
  securitiesValuation: 12_000,
  unrealisedReturn: { absoluteUnrealisedReturn: 345.67, relativeUnrealisedReturn: 0.028 },
  cryptoValuation: 0,
  lastInventoryUpdateTimestampUtc: { epochSecond: 1_000 },
  timeWeightedReturnByTimeframe: [{ timeframe: '1M', performance: 0.05, simpleAbsoluteReturn: 600 }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SubscriptionManager', () => {
  let subscriptionManager: Awaited<typeof import('./subscription.ts')>['subscriptionManager'];
  let getSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const sessionMod = await import('../auth/session.ts');
    const subMod = await import('./subscription.ts');

    subscriptionManager = subMod.subscriptionManager;
    getSession = vi.mocked(sessionMod.getSession as ReturnType<typeof vi.fn>);
    getSession.mockReturnValue(mockSession);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Returns the onData callback registered with wsManager.addSub. */
  function getOnData(): (data: unknown) => void {
    return mockWsManager.addSub.mock.calls[0][4] as (data: unknown) => void;
  }

  function fireValuation(overrides: Record<string, unknown> = {}) {
    getOnData()({ realTimeValuation: { ...validValuation, ...overrides } });
  }

  // -------------------------------------------------------------------------
  // subscribe / unsubscribe
  // -------------------------------------------------------------------------

  it('calls wsManager.addSub on the first subscriber', () => {
    subscriptionManager.subscribe(vi.fn());
    expect(mockWsManager.addSub).toHaveBeenCalledOnce();
    expect(mockWsManager.addSub).toHaveBeenCalledWith(
      expect.any(String),
      'RealTimeValuation',
      expect.stringContaining('realTimeValuation'),
      { portfolioId: 'pid-123' },
      expect.any(Function),
    );
  });

  it('does not call wsManager.addSub again for a second subscriber', () => {
    subscriptionManager.subscribe(vi.fn());
    subscriptionManager.subscribe(vi.fn());
    expect(mockWsManager.addSub).toHaveBeenCalledOnce();
  });

  it('calls wsManager.removeSub only when the last listener unsubscribes', () => {
    const unsub1 = subscriptionManager.subscribe(vi.fn());
    const unsub2 = subscriptionManager.subscribe(vi.fn());
    unsub1();
    expect(mockWsManager.removeSub).not.toHaveBeenCalled();
    unsub2();
    expect(mockWsManager.removeSub).toHaveBeenCalledOnce();
  });

  it('does not call wsManager.addSub and warns when there is no session', () => {
    getSession.mockReturnValue(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    subscriptionManager.subscribe(vi.fn());
    expect(mockWsManager.addSub).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No session'));
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Fan-out
  // -------------------------------------------------------------------------

  it('delivers data to all active listeners', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    subscriptionManager.subscribe(l1);
    subscriptionManager.subscribe(l2);
    fireValuation();
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('does not deliver data to an unsubscribed listener', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    subscriptionManager.subscribe(l1);
    const unsub2 = subscriptionManager.subscribe(l2);
    unsub2();
    fireValuation();
    expect(l1).toHaveBeenCalledOnce();
    expect(l2).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Zod parsing
  // -------------------------------------------------------------------------

  it('passes the parsed RealTimeValuation to listeners on valid data', () => {
    const listener = vi.fn();
    subscriptionManager.subscribe(listener);
    fireValuation();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ valuation: 12_345.67 }));
  });

  it('drops data and warns when the payload fails the schema', () => {
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    subscriptionManager.subscribe(listener);
    getOnData()({ realTimeValuation: { id: 'bad-shape' } }); // missing required fields
    expect(listener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('schema mismatch'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('ignores messages where the realTimeValuation key is absent', () => {
    const listener = vi.fn();
    subscriptionManager.subscribe(listener);
    getOnData()({ other: 'stuff' });
    expect(listener).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // fetchLatest — cache hit
  // -------------------------------------------------------------------------

  it('resolves immediately with the cached value when it is still fresh', async () => {
    subscriptionManager.subscribe(vi.fn());
    fireValuation();
    const result = await subscriptionManager.fetchLatest();
    expect(result).toMatchObject({ valuation: 12_345.67 });
  });

  it('does not add an extra subscriber when the cache is fresh', async () => {
    subscriptionManager.subscribe(vi.fn());
    fireValuation();
    mockWsManager.addSub.mockClear();

    await subscriptionManager.fetchLatest();
    expect(mockWsManager.addSub).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // fetchLatest — live wait (no cache)
  // -------------------------------------------------------------------------

  it('subscribes internally and resolves on the first live value when there is no cache', async () => {
    const promise = subscriptionManager.fetchLatest();
    // fetchLatest adds its own listener, which triggers addSub
    getOnData()({ realTimeValuation: validValuation });
    const result = await promise;
    expect(result).toMatchObject({ valuation: 12_345.67 });
  });

  it('auto-unsubscribes after resolving so the listener count drops back to zero', async () => {
    const promise = subscriptionManager.fetchLatest();
    getOnData()({ realTimeValuation: validValuation });
    await promise;
    expect(mockWsManager.removeSub).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // fetchLatest — timeout
  // -------------------------------------------------------------------------

  it('resolves null when no data arrives within the timeout', async () => {
    vi.useFakeTimers();
    const promise = subscriptionManager.fetchLatest(5_000);
    vi.advanceTimersByTime(5_001);
    const result = await promise;
    expect(result).toBeNull();
  });

  it('keeps the WS subscription alive after a fetchLatest timeout', async () => {
    vi.useFakeTimers();
    const promise = subscriptionManager.fetchLatest(5_000);
    vi.advanceTimersByTime(5_001);
    await promise;
    // addSub was called; removeSub must NOT have been called (subscription kept alive)
    expect(mockWsManager.removeSub).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // fetchLatest — stale cache
  // -------------------------------------------------------------------------

  it('waits for live data when the cached value is older than maxAgeMs', async () => {
    vi.useFakeTimers();

    // Populate the cache at fake time T0
    subscriptionManager.subscribe(vi.fn());
    fireValuation();

    // Advance past the default 30 s TTL
    vi.advanceTimersByTime(31_000);

    const promise = subscriptionManager.fetchLatest(5_000);

    // Fire a fresh valuation — same onData callback because the first subscriber is still active
    const freshVal = { ...validValuation, valuation: 42_000 };
    getOnData()({ realTimeValuation: freshVal });

    const result = await promise;
    expect(result).toMatchObject({ valuation: 42_000 });
  });
});
