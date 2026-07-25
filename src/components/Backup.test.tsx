/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { Backup } from './Backup';
import { LanguageSwitch } from './LanguageSwitch';

const MNEMONIC = Array.from({ length: 24 }, (_, index) => `word${index + 1}`);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Backup confirmation', () => {
  it('retranslates the mismatch error when the language changes', () => {
    render(
      <I18nProvider>
        <LanguageSwitch />
        <Backup mnemonic={MNEMONIC} onConfirmed={vi.fn()} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Word #4'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'I saved my phrase' }));

    const english = 'One of the words does not match. Check your copy and try again.';
    expect(screen.getByText(english)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));

    expect(screen.getByText('Alguna palabra no coincide. Revisa tu copia e intenta otra vez.'))
      .toBeInTheDocument();
    expect(screen.queryByText(english)).not.toBeInTheDocument();
  });

  it('confirms once the three sampled words match', () => {
    const onConfirmed = vi.fn();
    render(
      <I18nProvider locale="es">
        <Backup mnemonic={MNEMONIC} onConfirmed={onConfirmed} />
      </I18nProvider>,
    );

    for (const position of [4, 12, 24]) {
      fireEvent.change(screen.getByLabelText(`Palabra #${position}`), {
        target: { value: `WORD${position}` },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Ya guardé mi frase' }));

    expect(onConfirmed).toHaveBeenCalledOnce();
  });
});
