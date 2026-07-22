import {
  createWebWalletEngine,
  defaultConfig,
  RUNTIME_MANIFEST_VERSION,
} from '@lightninglabs/wavelength-web';

export const walletEngine = createWebWalletEngine({
  runtimeBaseUrl: new URL(
    `/wavewalletdk/${RUNTIME_MANIFEST_VERSION}/`,
    window.location.origin,
  ).href,
  config: defaultConfig('signet', { dataDir: '/rayito-wallet-v1' }),
  autoStart: true,
});
