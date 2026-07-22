import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WavelengthProvider } from '@lightninglabs/wavelength-react';
import { App } from './App';
import { walletEngine } from './lib/wavelength';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento raíz de la aplicación.');

createRoot(root).render(
  <StrictMode>
    <WavelengthProvider engine={walletEngine}>
      <App />
    </WavelengthProvider>
  </StrictMode>,
);
