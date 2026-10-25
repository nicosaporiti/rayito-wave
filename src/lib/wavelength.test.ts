/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wavelength = vi.hoisted(() => ({
  createEngine: vi.fn(() => ({ engine: true })),
  defaultConfig: vi.fn((network: string, overrides: object) => ({ network, preset: true, ...overrides })),
}));

vi.mock('@lightninglabs/wavelength-web', () => ({
  createWebWalletEngine: wavelength.createEngine,
  defaultConfig: wavelength.defaultConfig,
  RUNTIME_MANIFEST_VERSION: 'v0.2.0',
}));
vi.mock('@lightninglabs/wavelength-web/wavewalletdk-worker.js?raw', () => ({
  default: 'self.onmessage = () => undefined;',
}));

describe('wallet engine', () => {
  beforeEach(() => {
    wavelength.createEngine.mockClear();
    wavelength.defaultConfig.mockClear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:https://rayito.test/wavelength-worker'),
    });
    vi.resetModules();
    localStorage.clear();
  });

  it('starts the SDK worker from an in-bundle blob URL', async () => {
    await import('./wavelength');

    expect(wavelength.createEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        workerURL: 'blob:https://rayito.test/wavelength-worker',
      }),
    );
  });

  it('opens the Signet wallet unless another network was chosen', async () => {
    await import('./wavelength');

    expect(wavelength.defaultConfig).toHaveBeenCalledWith('signet', {
      dataDir: '/rayito-wallet-v1',
    });
  });

  it('opens a separate wallet on the stored network', async () => {
    localStorage.setItem('rayito.network', 'testnet');
    await import('./wavelength');

    expect(wavelength.createEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { network: 'testnet', preset: true, dataDir: '/rayito-wallet-testnet3' },
      }),
    );
  });
});
