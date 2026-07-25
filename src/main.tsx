import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WavelengthProvider } from '@lightninglabs/wavelength-react';
import { App } from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { walletEngine } from './lib/wavelength';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root element was not found.');

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <WavelengthProvider engine={walletEngine}>
        <App />
      </WavelengthProvider>
    </I18nProvider>
  </StrictMode>,
);
