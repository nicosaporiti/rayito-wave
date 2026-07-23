/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const wallet = vi.hoisted(() => ({
  error: null as Error | null,
  phase: 'ready',
  recoveryStatus: 'idle',
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
}));

vi.mock('@lightninglabs/wavelength-react', () => ({
  useWallet: () => ({
    error: wallet.error,
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
    wallet.error = null;
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

  it('keeps the wallet open when the page is hidden before the idle deadline', async () => {
    vi.useFakeTimers();
    render(<App />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    fireEvent(document, new Event('visibilitychange'));
    await act(async () => Promise.resolve());

    expect(wallet.stop).not.toHaveBeenCalled();
    expect(wallet.start).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1_000);
      await Promise.resolve();
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => Promise.resolve());

    expect(wallet.stop).not.toHaveBeenCalled();
    expect(wallet.start).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).toHaveBeenCalledOnce();
    expect(wallet.start).toHaveBeenCalledOnce();
  });

  it('locks on return when background timer execution was suspended past the deadline', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-07-23T00:00:00.000Z');
    vi.setSystemTime(startedAt);
    render(<App />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));

    vi.setSystemTime(startedAt.getTime() + 5 * 60 * 1_000 + 1);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => Promise.resolve());

    expect(wallet.stop).toHaveBeenCalledOnce();
    expect(wallet.start).toHaveBeenCalledOnce();
  });

  it('renews the idle deadline after user activity', async () => {
    vi.useFakeTimers();
    render(<App />);

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1_000);
    });
    fireEvent.pointerDown(window);
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).not.toHaveBeenCalled();
    expect(wallet.start).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).toHaveBeenCalledOnce();
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

  it('grants a full idle timeout when recovery finishes while the page is hidden', async () => {
    vi.useFakeTimers();
    wallet.recoveryStatus = 'restoring';
    const view = render(<App />);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    wallet.recoveryStatus = 'done';
    view.rerender(<App />);

    await act(async () => Promise.resolve());
    expect(wallet.stop).not.toHaveBeenCalled();
    expect(wallet.start).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1_000);
      await Promise.resolve();
    });

    expect(wallet.stop).toHaveBeenCalledOnce();
    expect(wallet.start).toHaveBeenCalledOnce();
  });

  it('shows neutral worker diagnostics and warns about browser-local wallet data', () => {
    wallet.phase = 'error';
    wallet.error = Object.assign(new Error('Worker runtime exited unexpectedly'), {
      code: 'worker_error',
    });

    render(<App />);

    expect(screen.getByText(/No pudimos iniciar uno de los procesos locales/)).toBeInTheDocument();
    expect(screen.getByText(/Puede deberse a un bloqueo del navegador o a que el motor se detuvo/)).toBeInTheDocument();
    expect(screen.getByText(/Worker runtime exited unexpectedly/)).toBeInTheDocument();
    expect(screen.getByText(/necesitás tus 24 palabras para recuperarla/)).toBeInTheDocument();
    expect(screen.getByText(/No borres los datos del perfil original/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
