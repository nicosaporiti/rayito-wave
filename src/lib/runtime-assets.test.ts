/** @vitest-environment node */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RUNTIME_ASSET_DIGESTS,
  RUNTIME_ASSET_FILES,
  RUNTIME_MANIFEST_VERSION,
} from '@lightninglabs/wavelength-web';
import { describe, expect, it } from 'vitest';
import { RUNTIME_LOCK_NAME } from './wallet-reset';

const runtimeDir = fileURLToPath(
  new URL(`../../public/wavewalletdk/${RUNTIME_MANIFEST_VERSION}/`, import.meta.url),
);

// The raw wasm lives in Git LFS, so a checkout without LFS only has a pointer
// file. Skip that case; the SDK loads the compressed copy first anyway.
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

describe('hosted runtime assets', () => {
  it.each(RUNTIME_ASSET_FILES)('%s matches the digest pinned by the SDK', (name) => {
    const bytes = readFileSync(`${runtimeDir}${name}`);
    if (bytes.subarray(0, LFS_POINTER_PREFIX.length).toString() === LFS_POINTER_PREFIX) return;

    const digest = `sha256-${createHash('sha256').update(bytes).digest('base64')}`;

    expect(digest).toBe(RUNTIME_ASSET_DIGESTS[name]);
  });
});

describe('runtime lock name', () => {
  it('matches the lock the SDK holds while a tab runs the wallet', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../node_modules/@lightninglabs/wavelength-web/dist/runtime-lock.js', import.meta.url)),
      'utf8',
    );

    expect(source).toContain(`RUNTIME_LOCK_NAME = '${RUNTIME_LOCK_NAME}'`);
  });
});
