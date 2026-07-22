/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const wavelength = vi.hoisted(() => ({
  createEngine: vi.fn(() => ({ engine: true })),
  defaultConfig: vi.fn(() => ({ network: 'signet' })),
}));

vi.mock('@lightninglabs/wavelength-web', () => ({
  createWebWalletEngine: wavelength.createEngine,
  defaultConfig: wavelength.defaultConfig,
  RUNTIME_MANIFEST_VERSION: 'v0.1.0',
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
  });

  it('starts the SDK worker from an in-bundle blob URL', async () => {
    await import('./wavelength');

    expect(wavelength.createEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        workerURL: 'blob:https://rayito.test/wavelength-worker',
      }),
    );
  });
});
