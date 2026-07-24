import type { Entry } from '@lightninglabs/wavelength-react';
import { describe, expect, it } from 'vitest';
import {
  depositConfirmations,
  depositMonitorState,
  parseEsploraDeposit,
  parseTipHeight,
} from './onchain-deposit';

const ADDRESS = 'tb1qrayitodeposit';

function depositEntry(
  status: Entry['status'] = 'pending',
  phase: NonNullable<Entry['progress']>['phase'] = 'waiting_for_payment',
  confirmationHeight = 0,
): Entry {
  return {
    amountSat: status === 'complete' ? 12_345 : 0,
    counterparty: 'boarding',
    createdAt: '2026-07-24T00:00:00.000Z',
    cursor: 1,
    failureCode: 'failed',
    failureReason: '',
    feeSat: 0,
    id: 'deposit-1',
    kind: 'deposit',
    note: '',
    progress: {
      confirmationHeight,
      paymentHash: '',
      phase,
      phaseLabel: '',
      preimage: '',
      txid: '',
      vTXOOutpoint: '',
    },
    request: {
      arkAddress: '',
      lightningInvoice: '',
      onchainAddress: ADDRESS,
      paymentHash: '',
      type: 'onchain',
    },
    status,
    updatedAt: '2026-07-24T00:00:00.000Z',
  };
}

const unconfirmedResponse = [{
  txid: 'funding-tx',
  status: { confirmed: false },
  vout: [
    { scriptpubkey_address: 'tb1qchange', value: 50_000 },
    { scriptpubkey_address: ADDRESS, value: 12_345 },
  ],
}];

describe('on-chain deposit monitor', () => {
  it('finds the output paying the generated address', () => {
    expect(parseEsploraDeposit(unconfirmedResponse, ADDRESS)).toEqual({
      amountSat: 12_345,
      status: { confirmed: false, blockHeight: null },
      txid: 'funding-tx',
    });
  });

  it('counts the transaction block as the first confirmation', () => {
    const deposit = parseEsploraDeposit([{
      ...unconfirmedResponse[0],
      status: { confirmed: true, block_height: 314_500 },
    }], ADDRESS);

    expect(depositConfirmations(deposit, 314_500)).toBe(1);
    expect(depositConfirmations(deposit, 314_502)).toBe(3);
    expect(parseTipHeight('314500')).toBe(314_500);
  });

  it('moves through waiting, mempool, boarding and complete states', () => {
    const entry = depositEntry();
    const mempoolDeposit = parseEsploraDeposit(unconfirmedResponse, ADDRESS);
    const confirmedDeposit = parseEsploraDeposit([{
      ...unconfirmedResponse[0],
      status: { confirmed: true, block_height: 314_500 },
    }], ADDRESS);

    expect(depositMonitorState(entry, null, 314_499).stage).toBe('waiting');
    expect(depositMonitorState(entry, mempoolDeposit, 314_499)).toMatchObject({
      stage: 'mempool',
      amountSat: 12_345,
    });
    expect(depositMonitorState(entry, confirmedDeposit, 314_500)).toMatchObject({
      stage: 'boarding',
      confirmations: 1,
    });
    expect(depositMonitorState(depositEntry('complete'), confirmedDeposit, 314_500).stage)
      .toBe('complete');
  });

  it('uses Wavelength confirmation progress when Esplora is unavailable', () => {
    expect(depositMonitorState(
      depositEntry('pending', 'waiting_for_confirmation', 314_500),
      null,
      null,
    )).toMatchObject({
      stage: 'boarding',
      confirmations: 1,
    });

    expect(depositMonitorState(
      depositEntry('pending', 'confirmed'),
      null,
      null,
    )).toMatchObject({
      stage: 'boarding',
      confirmations: 1,
    });
  });

  it('rejects malformed API boundaries', () => {
    expect(() => parseEsploraDeposit({ error: 'nope' }, ADDRESS)).toThrow();
    expect(() => parseTipHeight('not-a-height')).toThrow();
  });
});
