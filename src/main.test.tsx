/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boot = vi.hoisted(() => ({
  engineImported: vi.fn(),
  outcome: 'none' as string,
}));

vi.mock('./lib/wallet-reset', () => ({
  runPendingWalletReset: async () => boot.outcome,
}));
vi.mock('./lib/wavelength', () => {
  boot.engineImported();
  return { walletEngine: {} };
});
vi.mock('@lightninglabs/wavelength-react', () => ({
  WavelengthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('./App', () => ({
  App: ({ walletResetDone }: { walletResetDone: boolean }) => (
    <p>{walletResetDone ? 'app after reset' : 'app'}</p>
  ),
}));
vi.mock('./components/WalletResetFailure', () => ({
  WalletResetFailure: ({ outcome }: { outcome: string }) => <p>{`reset failed: ${outcome}`}</p>,
}));

async function startApp(): Promise<void> {
  await act(async () => {
    await import('./main');
  });
}

describe('boot sequence', () => {
  beforeEach(() => {
    vi.resetModules();
    boot.engineImported.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each(['blocked', 'untouched', 'partial'])(
    'never creates the wallet engine when the deletion ends %s',
    async (outcome) => {
      boot.outcome = outcome;
      await startApp();

      expect(await screen.findByText(`reset failed: ${outcome}`)).toBeInTheDocument();
      expect(boot.engineImported).not.toHaveBeenCalled();
    },
  );

  it('creates the engine only after a finished deletion', async () => {
    boot.outcome = 'done';
    await startApp();

    expect(await screen.findByText('app after reset')).toBeInTheDocument();
    expect(boot.engineImported).toHaveBeenCalledOnce();
  });
});
