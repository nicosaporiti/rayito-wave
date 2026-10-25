import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WavelengthProvider } from '@lightninglabs/wavelength-react';
import { App } from './App';
import { WalletResetFailure } from './components/WalletResetFailure';
import { I18nProvider } from './i18n/I18nProvider';
import { runPendingWalletReset } from './lib/wallet-reset';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The application root element was not found.');
const root = createRoot(rootElement);

function render(node: ReactNode): void {
  root.render(
    <StrictMode>
      <I18nProvider>{node}</I18nProvider>
    </StrictMode>,
  );
}

async function boot(): Promise<void> {
  // A pending wallet deletion must run before the engine exists: creating it
  // starts the runtime, which opens the very files the deletion removes.
  const walletReset = await runPendingWalletReset();
  if (walletReset !== 'none' && walletReset !== 'done') {
    render(<WalletResetFailure outcome={walletReset} />);
    return;
  }

  const { walletEngine } = await import('./lib/wavelength');
  render(
    <WavelengthProvider engine={walletEngine}>
      <App walletResetDone={walletReset === 'done'} />
    </WavelengthProvider>,
  );
}

void boot();
