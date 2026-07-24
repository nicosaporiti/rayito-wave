/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { Entry } from '@lightninglabs/wavelength-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnchainDepositStatus } from './OnchainDepositStatus';

const ADDRESS = 'tb1qrayitosignetexample';
const POLL_INTERVAL_MS = 10_000;

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  if (!resolvePromise) throw new Error('No se pudo crear la promesa diferida.');
  return { promise, resolve: resolvePromise };
}

function depositEntry(status: Entry['status']): Entry {
  return {
    amountSat: status === 'complete' ? 12_345 : 0,
    counterparty: '',
    createdAt: '2026-07-23T19:00:00.000Z',
    cursor: 0,
    failureCode: 'failed',
    failureReason: status === 'failed' ? 'Depósito rechazado' : '',
    feeSat: 0,
    id: 'deposit-visible',
    kind: 'deposit',
    note: '',
    status,
    updatedAt: '2026-07-23T19:00:00.000Z',
  };
}

function transactionsResponse(): Response {
  return new Response('[]', {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function tipResponse(): Response {
  return new Response('314500', { status: 200 });
}

describe('OnchainDepositStatus polling', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for the active refresh before scheduling the next poll', async () => {
    const pendingTransactions = deferred<Response>();
    const pendingTip = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(pendingTransactions.promise)
      .mockReturnValueOnce(pendingTip.promise)
      .mockResolvedValueOnce(transactionsResponse())
      .mockResolvedValueOnce(tipResponse());

    render(<OnchainDepositStatus address={ADDRESS} entry={depositEntry('pending')} />);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingTransactions.resolve(transactionsResponse());
      pendingTip.resolve(tipResponse());
      await Promise.all([pendingTransactions.promise, pendingTip.promise]);
    });

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each(['complete', 'failed'] satisfies readonly Entry['status'][])(
    'stops polling when the deposit becomes %s',
    async (terminalStatus) => {
      fetchMock
        .mockResolvedValueOnce(transactionsResponse())
        .mockResolvedValueOnce(tipResponse());
      const view = render(
        <OnchainDepositStatus address={ADDRESS} entry={depositEntry('pending')} />,
      );

      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      view.rerender(
        <OnchainDepositStatus address={ADDRESS} entry={depositEntry(terminalStatus)} />,
      );
      await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3));

      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
});
