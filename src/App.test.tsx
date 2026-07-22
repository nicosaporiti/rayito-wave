/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const wallet = vi.hoisted(() => ({
  phase: 'ready',
  recoveryStatus: 'idle',
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
}));

vi.mock('@lightninglabs/wavelength-react', () => ({
  useWallet: () => ({
    error: null,
    phase: wallet.phase,
    start: wallet.start,
    stop: wallet.stop,
  }),
  useWalletRecovery: () => {
    if (wallet.recoveryStatus === 'restoring') {
      return { acknowledge: vi.fn(), recovery: { status: 'restoring' } };
    }
    if (wallet.recoveryStatus === 'done') {
      return {
        acknowledge: vi.fn(),
        recovery: { status: 'done', result: { recoveredVTXOs: 0 } },
      };
    }
    return { acknowledge: vi.fn(), recovery: { status: 'idle' } };
  },
}));
vi.mock('./components/Backup', () => ({ Backup: () => <main>Backup</main> }));
vi.mock('./components/Brand', () => ({
  Brand: () => <span>Rayito</span>,
  NetworkBadge: () => <span>Signet</span>,
}));
vi.mock('./components/Dashboard', () => ({ Dashboard: () => <main>Dashboard</main> }));
vi.mock('./components/Onboarding', () => ({
  Onboarding: () => <main>Onboarding</main>,
  Unlock: () => <main>Unlock</main>,
}));
vi.mock('./components/Icons', () => ({ BoltIcon: () => <span /> }));

describe('App wallet locking', () => {
  beforeEach(() => {
    wallet.phase = 'ready';
    wallet.recoveryStatus = 'idle';
    wallet.start.mockClear();
    wallet.stop.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stops and restarts the runtime when the user locks manually', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(wallet.stop).toHaveBeenCalledOnce());
    expect(wallet.start).toHaveBeenCalledOnce();
    const stopOrder = wallet.stop.mock.invocationCallOrder[0];
    const startOrder = wallet.start.mock.invocationCallOrder[0];
    if (stopOrder === undefined || startOrder === undefined) {
      throw new Error('Missing wallet lifecycle call order');
    }
    expect(stopOrder).toBeLessThan(startOrder);
  });

  it('locks after five minutes without activity', async () => {
    vi.useFakeTimers();
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).toHaveBeenCalledOnce();
    expect(wallet.start).toHaveBeenCalledOnce();
  });

  it('locks immediately when the page becomes hidden', async () => {
    render(<App />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => expect(wallet.stop).toHaveBeenCalledOnce());
    expect(wallet.start).toHaveBeenCalledOnce();
  });

  it('prevents locking and warns before unloading during recovery', async () => {
    vi.useFakeTimers();
    wallet.recoveryStatus = 'restoring';
    render(<App />);

    const lockButton = screen.getByRole('button', { name: 'Recuperando…' });
    expect(lockButton).toBeDisabled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).not.toHaveBeenCalled();
    expect(wallet.start).not.toHaveBeenCalled();

    const unloadEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unloadEvent);
    expect(unloadEvent.defaultPrevented).toBe(true);
  });

  it('locks when recovery finishes while the page is already hidden', async () => {
    wallet.recoveryStatus = 'restoring';
    const view = render(<App />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    wallet.recoveryStatus = 'done';
    view.rerender(<App />);

    await waitFor(() => expect(wallet.stop).toHaveBeenCalledOnce());
    expect(wallet.start).toHaveBeenCalledOnce();
  });
});
