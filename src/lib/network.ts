import { useEffect, useSyncExternalStore } from 'react';

// The test networks Rayito can run on, keyed by the SDK's preset name. The SDK
// calls testnet3 plain 'testnet'. The endpoints mirror the SDK presets in
// @lightninglabs/wavelength-core/dist/config.js; they are copied rather than
// imported so components can read them without loading the SDK, and every
// host listed here must also be allowed by connect-src in public/_headers and
// vercel.json (network.test.ts checks both).
export const NETWORKS = ['signet', 'testnet'] as const;
export type WalletNetwork = (typeof NETWORKS)[number];

export type NetworkProfile = {
  readonly label: string;
  /** Each network keeps its own wallet, so switching never mixes funds. */
  readonly dataDir: string;
  readonly esploraApi: string;
  readonly explorerUrl: string;
  readonly faucetUrl: string;
};

export const NETWORK_PROFILES = {
  signet: {
    label: 'Signet',
    // The directory every wallet created before the switch already lives in.
    dataDir: '/rayito-wallet-v1',
    esploraApi: 'https://mempool-signet.testnet.lightningcluster.com/api',
    explorerUrl: 'https://mempool.space/signet',
    faucetUrl: 'https://bitcoinsignetfaucet.com/',
  },
  testnet: {
    label: 'Testnet3',
    dataDir: '/rayito-wallet-testnet3',
    esploraApi: 'https://mempool-testnet3.testnet.lightningcluster.com/api',
    explorerUrl: 'https://mempool.space/testnet',
    faucetUrl: 'https://coinfaucet.eu/en/btc-testnet/',
  },
} as const satisfies Record<WalletNetwork, NetworkProfile>;

export const NETWORK_STORAGE_KEY = 'rayito.network';
export const DEFAULT_NETWORK: WalletNetwork = 'signet';

export function isWalletNetwork(value: unknown): value is WalletNetwork {
  return NETWORKS.some((network) => network === value);
}

function storedNetwork(): WalletNetwork {
  try {
    const value = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    return isWalletNetwork(value) ? value : DEFAULT_NETWORK;
  } catch {
    // Without storage the wallet stays on the default network.
    return DEFAULT_NETWORK;
  }
}

let loadedNetwork: WalletNetwork | null = null;

/**
 * The network this page load runs on. The wallet engine is bound to it when
 * it starts, so it is read once: a later write by another tab must not point
 * this tab's links, explorer polling or copy at a network its wallet is not on.
 */
export function activeNetwork(): WalletNetwork {
  loadedNetwork ??= storedNetwork();
  return loadedNetwork;
}

export function activeNetworkProfile(): NetworkProfile {
  return NETWORK_PROFILES[activeNetwork()];
}

/** Tests only: forgets the network read by this page load. */
export function forgetActiveNetwork(): void {
  loadedNetwork = null;
}

/**
 * Stores the choice, stops the wallet so the reload does not race the runtime
 * lock it holds, and reloads, so the engine starts on the new network.
 * Returns false, without reloading, when the browser refuses to store it.
 */
export async function switchNetwork(
  network: WalletNetwork,
  stopWallet: () => Promise<void>,
  reload: () => void = () => window.location.reload(),
): Promise<boolean> {
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    return false;
  }
  try {
    await stopWallet();
  } catch {
    // The reload ends the runtime anyway; stopping only releases it sooner.
  }
  reload();
  return true;
}

// Work a reload would abandon: showing the recovery words once, a restore, or
// a payment or invoice in flight. Each holder registers while it lasts.
const holders = new Set<symbol>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Blocks network switching until the returned release is called. */
export function holdNetwork(): () => void {
  const holder = Symbol('network-hold');
  holders.add(holder);
  notify();
  return () => {
    if (holders.delete(holder)) notify();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNetworkHeld(): boolean {
  return useSyncExternalStore(subscribe, () => holders.size > 0, () => false);
}

/** Holds network switching for as long as `active` is true. */
export function useHoldNetwork(active: boolean): void {
  useEffect(() => (active ? holdNetwork() : undefined), [active]);
}
