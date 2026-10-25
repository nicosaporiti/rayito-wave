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
import { Onboarding, Unlock } from './Onboarding';

const restore = vi.hoisted(() => vi.fn(async () => undefined));
const stop = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@lightninglabs/wavelength-react', () => ({
  useWallet: () => ({ stop }),
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

describe('Forgotten password', () => {
  const reload = vi.fn();

  afterEach(() => {
    cleanup();
    stop.mockClear();
    reload.mockClear();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('warns about the consequences and only deletes after explicit confirmation', async () => {
    vi.stubGlobal('location', { ...window.location, reload });
    render(<Unlock />);

    fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));

    expect(screen.getByRole('heading', { name: 'Borrar la wallet de este navegador' }))
      .toBeInTheDocument();
    expect(screen.getByText(/No podemos recuperar ni cambiar tu contraseña/)).toBeInTheDocument();
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
    expect(screen.getByText(/Sin ellas, se pierden para siempre/)).toBeInTheDocument();
    expect(screen.getByText(/Los pagos o cobros que estén en curso/)).toBeInTheDocument();
    expect(screen.getByText(/Cierra Rayito en otras pestañas/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Borrar la wallet de este navegador' })).toHaveFocus();

    const deleteButton = screen.getByRole('button', { name: 'Borrar wallet de este navegador' });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Entiendo que se borrará la wallet/ }));
    fireEvent.click(deleteButton);

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(stop).toHaveBeenCalledOnce();
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0] ?? 0);
    expect(Number(window.sessionStorage.getItem('rayito.walletReset'))).toBeGreaterThan(0);
  });

  it('goes back to the unlock form without requesting anything', () => {
    render(<Unlock />);

    fireEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByRole('heading', { name: 'Desbloquea tu wallet' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('rayito.walletReset')).toBeNull();
  });

  it('announces the deletion once the setup screen comes back', async () => {
    render(<Onboarding onCreated={vi.fn()} walletResetDone />);

    const notice = screen.getByRole('status');
    expect(notice).toBeEmptyDOMElement();
    await waitFor(() => expect(notice).toHaveTextContent('Borramos la wallet de este navegador'));
  });
});
