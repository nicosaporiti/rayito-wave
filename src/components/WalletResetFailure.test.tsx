/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '../test/render';
import { WalletResetFailure } from './WalletResetFailure';

describe('WalletResetFailure', () => {
  const reload = vi.fn();

  afterEach(() => {
    cleanup();
    reload.mockClear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('offers to keep the wallet when another tab blocked the deletion', () => {
    vi.stubGlobal('location', { ...window.location, reload });
    render(<WalletResetFailure outcome="blocked" />);

    expect(screen.getByText(/sigue abierta en otra pestaña/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No borrar y abrir la wallet' }));

    expect(reload).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem('rayito.walletReset')).toBeNull();
  });

  it('asks again for the deletion only when the user retries', () => {
    vi.stubGlobal('location', { ...window.location, reload });
    render(<WalletResetFailure outcome="untouched" />);

    expect(screen.getByText(/No se borró nada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

    expect(Number(window.sessionStorage.getItem('rayito.walletReset'))).toBeGreaterThan(0);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('never offers to keep a partially deleted wallet', () => {
    vi.stubGlobal('location', { ...window.location, reload });
    render(<WalletResetFailure outcome="partial" />);

    expect(screen.getByText(/Se borró parte de la wallet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'No borrar y abrir la wallet' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

    // The shared wipe marker resumes the deletion; no new confirmation is recorded.
    expect(window.sessionStorage.getItem('rayito.walletReset')).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });
});
