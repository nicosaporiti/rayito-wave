/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/I18nProvider';
import { LOCALE_STORAGE_KEY } from '../i18n/locale';
import { useI18n } from '../i18n/useI18n';
import { LanguageSwitch } from './LanguageSwitch';

function Screen() {
  const { plural, t } = useI18n();

  return (
    <>
      <LanguageSwitch />
      <h1>{t('unlock.title')}</h1>
      <p>{plural('movements.count', 3)}</p>
    </>
  );
}

function renderSwitch() {
  return render(<I18nProvider><Screen /></I18nProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe('LanguageSwitch', () => {
  it('starts in the browser language and swaps the whole surface on demand', () => {
    renderSwitch();

    expect(screen.getByRole('heading')).toHaveTextContent('Unlock your wallet');

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));

    expect(screen.getByRole('heading')).toHaveTextContent('Desbloquea tu wallet');
    expect(screen.getByText('3 movimientos')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toBe('Rayito — tu bitcoin, en tus manos');
  });

  it('marks the active language and remembers the choice for the next visit', () => {
    const { unmount } = renderSwitch();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));
    expect(screen.getByRole('button', { name: 'Español' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');

    unmount();
    renderSwitch();

    expect(screen.getByRole('heading')).toHaveTextContent('Desbloquea tu wallet');
  });
});
