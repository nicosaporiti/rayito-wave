/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from '@lightninglabs/wavelength-web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeNetwork,
  forgetActiveNetwork,
  NETWORK_PROFILES,
  NETWORKS,
  switchNetwork,
} from './network';

function readProjectFile(path: string): string {
  // node:path, not URL: jsdom replaces the global URL with one that does not
  // resolve file: URLs.
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', path), 'utf8');
}

function connectSources(policy: string): Set<string> {
  const directive = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src '));
  return new Set(directive?.split(/\s+/).slice(1));
}

function policiesIn(path: string): string[] {
  return [...readProjectFile(path).matchAll(/default-src [^"\n]+/g)].map(([policy]) => policy);
}

describe('network selection', () => {
  afterEach(() => {
    localStorage.clear();
    forgetActiveNetwork();
    vi.restoreAllMocks();
  });

  it('defaults to Signet and ignores unknown stored values', () => {
    expect(activeNetwork()).toBe('signet');
    forgetActiveNetwork();
    localStorage.setItem('rayito.network', 'mainnet');
    expect(activeNetwork()).toBe('signet');
  });

  it('reads the stored network once per page load', () => {
    localStorage.setItem('rayito.network', 'testnet');
    expect(activeNetwork()).toBe('testnet');

    localStorage.setItem('rayito.network', 'signet');
    expect(activeNetwork()).toBe('testnet');
  });

  it('stores the choice and stops the wallet before reloading', async () => {
    const order: string[] = [];
    const stop = vi.fn(async () => { order.push('stop'); });
    const reload = vi.fn(() => { order.push('reload'); });

    await expect(switchNetwork('testnet', stop, reload)).resolves.toBe(true);
    expect(localStorage.getItem('rayito.network')).toBe('testnet');
    expect(order).toEqual(['stop', 'reload']);
  });

  it('reloads even when stopping the wallet fails', async () => {
    const reload = vi.fn();

    await switchNetwork('testnet', async () => { throw new Error('stuck'); }, reload);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('neither stops nor reloads when the browser refuses to store the choice', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const stop = vi.fn(async () => undefined);
    const reload = vi.fn();

    await expect(switchNetwork('testnet', stop, reload)).resolves.toBe(false);
    expect(stop).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('network endpoints', () => {
  it.each(NETWORKS)('%s keeps its own wallet directory', (network) => {
    const dataDirs = NETWORKS.map((other) => NETWORK_PROFILES[other].dataDir);
    expect(dataDirs.filter((dataDir) => dataDir === NETWORK_PROFILES[network].dataDir)).toHaveLength(1);
  });

  it.each(NETWORKS)('%s uses the esplora server of the SDK preset', (network) => {
    expect(NETWORK_PROFILES[network].esploraApi).toBe(defaultConfig(network).walletEsploraUrl);
  });

  it.each(['public/_headers', 'vercel.json'])('%s lets every network reach its servers', (path) => {
    const policies = policiesIn(path);
    expect(policies.length).toBeGreaterThan(0);

    for (const policy of policies) {
      const allowed = connectSources(policy);
      for (const network of NETWORKS) {
        const config = defaultConfig(network);
        for (const url of [config.arkServerAddress, config.swapServerAddress, NETWORK_PROFILES[network].esploraApi]) {
          expect(allowed, `${network}: ${url}`).toContain(new URL(String(url)).origin);
        }
      }
    }
  });
});
