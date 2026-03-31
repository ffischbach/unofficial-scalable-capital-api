import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function makeTick(isin: string, midPrice = 100) {
  return {
    id: `tick-${isin}`,
    isin,
    midPrice,
    time: '2026-01-01T10:00:00Z',
    currency: 'EUR',
    bidPrice: midPrice - 0.1,
    askPrice: midPrice + 0.1,
    isOutdated: false,
    timestampUtc: { time: '2026-01-01T10:00:00Z', epochMillisecond: 1_000_000 },
    performanceDate: { date: '2026-01-01' },
    performancesByTimeframe: [{ timeframe: '1D', performance: 0.01, simpleAbsoluteReturn: 1 }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuoteManager', () => {
  let quoteManager: Awaited<typeof import('./quoteSubscription.ts')>['quoteManager'];
  let getSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const sessionMod = await import('../auth/session.ts');
    const quoteMod = await import('./quoteSubscription.ts');

    quoteManager = quoteMod.quoteManager;
    getSession = vi.mocked(sessionMod.getSession as ReturnType<typeof vi.fn>);
    getSession.mockReturnValue(mockSession);
  });

  /**
   * Returns the most recently registered onData callback.
   * After an updateSub call it lives in updateSub's args; otherwise in addSub's.
   */
  function getLatestOnData(): (data: unknown) => void {
    const updateCalls = mockWsManager.updateSub.mock.calls;
    if (updateCalls.length > 0) {
      return updateCalls[updateCalls.length - 1][5] as (data: unknown) => void;
    }
    return mockWsManager.addSub.mock.calls[0][4] as (data: unknown) => void;
  }

  function fireTick(tick: ReturnType<typeof makeTick>) {
    getLatestOnData()({ realTimeQuoteTicks: tick });
  }

  // -------------------------------------------------------------------------
  // subscribe / wsManager wiring
  // -------------------------------------------------------------------------

  it('calls wsManager.addSub on the first subscriber', () => {
    quoteManager.subscribe(['AAPL'], vi.fn());
    expect(mockWsManager.addSub).toHaveBeenCalledOnce();
    expect(mockWsManager.addSub).toHaveBeenCalledWith(
      expect.any(String),
      'realTimeQuoteTicks',
      expect.stringContaining('realTimeQuoteTicks'),
      expect.objectContaining({ isins: ['AAPL'], portfolioId: 'pid-123' }),
      expect.any(Function),
    );
  });

  it('calls wsManager.updateSub when a second subscriber adds new ISINs', () => {
    quoteManager.subscribe(['AAPL'], vi.fn());
    const firstId = mockWsManager.addSub.mock.calls[0][0] as string;

    quoteManager.subscribe(['MSFT'], vi.fn());

    expect(mockWsManager.updateSub).toHaveBeenCalledOnce();
    expect(mockWsManager.updateSub).toHaveBeenCalledWith(
      firstId,
      expect.any(String),
      'realTimeQuoteTicks',
      expect.any(String),
      expect.objectContaining({ isins: ['AAPL', 'MSFT'] }),
      expect.any(Function),
    );
  });

  it('does not call wsManager.updateSub when second subscriber ISINs are a subset', () => {
    quoteManager.subscribe(['AAPL', 'MSFT'], vi.fn());
    quoteManager.subscribe(['AAPL'], vi.fn());
    expect(mockWsManager.updateSub).not.toHaveBeenCalled();
  });

  it('calls wsManager.removeSub when the last listener unsubscribes', () => {
    const unsub = quoteManager.subscribe(['AAPL'], vi.fn());
    const registeredId = mockWsManager.addSub.mock.calls[0][0] as string;
    unsub();
    expect(mockWsManager.removeSub).toHaveBeenCalledWith(registeredId);
  });

  it('calls wsManager.updateSub with reduced ISINs when one listener leaves but others remain', () => {
    const unsub1 = quoteManager.subscribe(['AAPL'], vi.fn());
    quoteManager.subscribe(['MSFT'], vi.fn()); // union: ['AAPL', 'MSFT']

    vi.clearAllMocks();
    unsub1(); // only ['MSFT'] remains

    expect(mockWsManager.updateSub).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'realTimeQuoteTicks',
      expect.any(String),
      expect.objectContaining({ isins: ['MSFT'] }),
      expect.any(Function),
    );
    expect(mockWsManager.removeSub).not.toHaveBeenCalled();
  });

  it('does not call wsManager.updateSub when unsubscribing does not reduce the ISIN set', () => {
    quoteManager.subscribe(['AAPL', 'MSFT'], vi.fn());
    const unsub2 = quoteManager.subscribe(['MSFT'], vi.fn());

    vi.clearAllMocks();
    unsub2(); // ['AAPL', 'MSFT'] stays the same — no update needed

    expect(mockWsManager.updateSub).not.toHaveBeenCalled();
  });

  it('does not call wsManager.addSub and warns when there is no session', () => {
    getSession.mockReturnValue(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quoteManager.subscribe(['AAPL'], vi.fn());
    expect(mockWsManager.addSub).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No session'));
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // ISIN deduplication and sorting
  // -------------------------------------------------------------------------

  it('sorts ISINs alphabetically in the subscription variables', () => {
    quoteManager.subscribe(['MSFT', 'AAPL'], vi.fn());
    expect(mockWsManager.addSub).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ isins: ['AAPL', 'MSFT'] }),
      expect.any(Function),
    );
  });

  it('deduplicates ISINs that appear in multiple subscribers', () => {
    quoteManager.subscribe(['AAPL'], vi.fn());
    quoteManager.subscribe(['AAPL', 'MSFT'], vi.fn());
    expect(mockWsManager.updateSub).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ isins: ['AAPL', 'MSFT'] }), // AAPL not doubled
      expect.any(Function),
    );
  });

  // -------------------------------------------------------------------------
  // Fan-out
  // -------------------------------------------------------------------------

  it('delivers a tick only to listeners that subscribed to that ISIN', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    quoteManager.subscribe(['AAPL'], l1);
    quoteManager.subscribe(['MSFT'], l2);

    fireTick(makeTick('AAPL', 150));

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).not.toHaveBeenCalled();
  });

  it('delivers a tick to all listeners subscribed to that ISIN', () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    quoteManager.subscribe(['AAPL'], l1);
    quoteManager.subscribe(['AAPL'], l2);

    fireTick(makeTick('AAPL', 200));

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
  });

  it('does not deliver ticks to a listener after it unsubscribes', () => {
    const l1 = vi.fn();
    const unsub = quoteManager.subscribe(['AAPL'], l1);
    unsub();
    // After unsub the sub is removed, so getLatestOnData would fail — instead exercise
    // a scenario where another listener is still present
    const l2 = vi.fn();
    quoteManager.subscribe(['AAPL'], l2); // re-subscribe to get a fresh onData
    fireTick(makeTick('AAPL', 300));

    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Zod parsing
  // -------------------------------------------------------------------------

  it('dispatches the parsed tick to the listener', () => {
    const listener = vi.fn();
    quoteManager.subscribe(['AAPL'], listener);
    fireTick(makeTick('AAPL', 175.5));
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isin: 'AAPL', midPrice: 175.5 }),
    );
  });

  it('drops the tick and warns when the payload fails the schema', () => {
    const listener = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    quoteManager.subscribe(['AAPL'], listener);
    getLatestOnData()({ realTimeQuoteTicks: { isin: 'AAPL' } }); // missing required fields
    expect(listener).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('schema mismatch'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });

  it('ignores messages where the realTimeQuoteTicks key is absent', () => {
    const listener = vi.fn();
    quoteManager.subscribe(['AAPL'], listener);
    getLatestOnData()({ other: 'data' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores a valid tick whose ISIN is not subscribed by any listener', () => {
    const listener = vi.fn();
    quoteManager.subscribe(['AAPL'], listener);
    fireTick(makeTick('MSFT', 300)); // MSFT is in the WS sub but no listener cares
    expect(listener).not.toHaveBeenCalled();
  });
});
