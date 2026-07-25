import { render as testingLibraryRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nProvider } from '../i18n/I18nProvider';
import type { Locale } from '../i18n/messages';

/**
 * Renders inside the i18n provider with a pinned locale so assertions never
 * depend on the browser language of whoever runs the suite.
 */
export function render(
  ui: ReactElement,
  { locale = 'es', ...options }: RenderOptions & { readonly locale?: Locale } = {},
): RenderResult {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <I18nProvider locale={locale}>{children}</I18nProvider>
  );

  return testingLibraryRender(ui, { wrapper, ...options });
}
