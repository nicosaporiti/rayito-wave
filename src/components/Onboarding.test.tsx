/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render as renderUnpinned,
  screen,
  waitFor,
} from '@testing-library/react';
import { render } from '../test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { LanguageSwitch } from './LanguageSwitch';
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
    // The language switch persists its choice, which would leak between tests.
    window.localStorage.clear();
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
    fireEvent.change(screen.getByPlaceholderText('Vuelve a escribirla'), {
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

  it('retranslates a visible validation error when the language changes', () => {
    renderUnpinned(
      <I18nProvider>
        <LanguageSwitch />
        <Onboarding onCreated={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('At least 10 characters'), {
      target: { value: 'short1' },
    });
    fireEvent.change(screen.getByPlaceholderText('Type it again'), {
      target: { value: 'short1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create my wallet' }));

    expect(screen.getByText('Use at least 10 characters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));

    expect(screen.getByText('Usa al menos 10 caracteres.')).toBeInTheDocument();
    expect(screen.queryByText('Use at least 10 characters.')).not.toBeInTheDocument();
  });

  it('retranslates an interpolated validation error when the language changes', () => {
    renderUnpinned(
      <I18nProvider>
        <LanguageSwitch />
        <Onboarding onCreated={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Restore' }));
    fireEvent.change(screen.getByPlaceholderText(/word 1/), {
      target: { value: 'one two three' },
    });
    fireEvent.change(screen.getByPlaceholderText('At least 10 characters'), {
      target: { value: 'clave-segura-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Type it again'), {
      target: { value: 'clave-segura-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restore wallet' }));

    expect(screen.getByText('The phrase must have 24 words; we found 3.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));

    expect(screen.getByText('La frase debe tener 24 palabras; encontramos 3.')).toBeInTheDocument();
  });
});
