/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';

const restore = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@lightninglabs/wavelength-react', () => ({
  useWalletCreate: () => ({
    create: vi.fn(),
    createError: null,
    createPending: false,
    resetCreate: vi.fn(),
  }),
  useWalletRestore: () => ({
    resetRestore: vi.fn(),
    restore,
    restoreError: null,
    restorePending: false,
  }),
  useWalletUnlock: () => ({
    unlock: vi.fn(),
    unlockError: null,
    unlockPending: false,
  }),
}));

describe('Onboarding recovery', () => {
  afterEach(() => {
    cleanup();
    restore.mockClear();
  });

  it('requests server recovery with an expanded address window', async () => {
    render(<Onboarding onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Recuperar' }));
    fireEvent.change(screen.getByPlaceholderText(/palabra 1/), {
      target: { value: Array.from({ length: 24 }, (_, index) => `palabra${index + 1}`).join(' ') },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 10 caracteres'), {
      target: { value: 'clave-segura-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Volvé a escribirla'), {
      target: { value: 'clave-segura-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar wallet' }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith({
      mnemonic: Array.from({ length: 24 }, (_, index) => `palabra${index + 1}`),
      password: 'clave-segura-123',
      recoverState: true,
      recoveryWindow: 100,
    }));
  });
});
