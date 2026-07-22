import {
  createWebWalletEngine,
  defaultConfig,
  RUNTIME_MANIFEST_VERSION,
} from '@lightninglabs/wavelength-web';
import wavelengthWorkerSource from '@lightninglabs/wavelength-web/wavewalletdk-worker.js?raw';

const wavelengthWorkerURL = URL.createObjectURL(
  new Blob([wavelengthWorkerSource], { type: 'application/javascript' }),
);

export const walletEngine = createWebWalletEngine({
  // A blob inherits the document's current isolation policy and cannot reuse a
  // stale pre-COEP response cached under Vite's stable /assets worker URL.
  workerURL: wavelengthWorkerURL,
  runtimeBaseUrl: new URL(
    `/wavewalletdk/${RUNTIME_MANIFEST_VERSION}/`,
    window.location.origin,
  ).href,
  config: defaultConfig('signet', { dataDir: '/rayito-wallet-v1' }),
  autoStart: true,
});
