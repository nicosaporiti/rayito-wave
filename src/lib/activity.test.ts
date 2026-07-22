import type { Entry } from '@lightninglabs/wavelength-react';
import { describe, expect, it } from 'vitest';
import {
  activityRail,
  filterActivity,
  isIncomingEntry,
  mergeActivityEntries,
  recentActivity,
} from './activity';

function entry(
  id: string,
  kind: Entry['kind'],
  requestType?: NonNullable<Entry['request']>['type'],
): Entry {
  return {
    amountSat: kind === 'receive' || kind === 'deposit' ? 1_000 : -1_000,
    counterparty: '',
    createdAt: '2026-07-21T19:00:00.000Z',
    cursor: 0,
    failureCode: 'failed',
    failureReason: '',
    feeSat: 0,
    id,
    kind,
    note: '',
    request: requestType ? {
      arkAddress: '',
      lightningInvoice: '',
      onchainAddress: '',
      paymentHash: '',
      type: requestType,
    } : undefined,
    status: 'complete',
    updatedAt: '2026-07-21T19:00:00.000Z',
  };
}

const entries = [
  entry('receive-ln', 'receive', 'lightning'),
  entry('deposit-chain', 'deposit', 'onchain'),
  entry('send-ln', 'send', 'lightning'),
  entry('send-chain', 'send', 'onchain'),
  entry('exit-chain', 'exit'),
  entry('send-ark', 'send', 'ark'),
] as const;

describe('activity filters', () => {
  it('classifies direction and rail using request metadata and kind fallbacks', () => {
    expect(isIncomingEntry(entries[0])).toBe(true);
    expect(isIncomingEntry(entries[2])).toBe(false);
    expect(activityRail(entries[0])).toBe('lightning');
    expect(activityRail(entries[4])).toBe('onchain');
  });

  it('filters income, expense, on-chain and Lightning entries', () => {
    expect(filterActivity(entries, 'income').map(({ id }) => id))
      .toEqual(['receive-ln', 'deposit-chain']);
    expect(filterActivity(entries, 'expense').map(({ id }) => id))
      .toEqual(['send-ln', 'send-chain', 'exit-chain', 'send-ark']);
    expect(filterActivity(entries, 'onchain').map(({ id }) => id))
      .toEqual(['deposit-chain', 'send-chain', 'exit-chain']);
    expect(filterActivity(entries, 'lightning').map(({ id }) => id))
      .toEqual(['receive-ln', 'send-ln']);
  });
});

describe('recentActivity', () => {
  it('keeps only the five newest entries in their existing order', () => {
    expect(recentActivity(entries).map(({ id }) => id)).toEqual([
      'receive-ln',
      'deposit-chain',
      'send-ln',
      'send-chain',
      'exit-chain',
    ]);
  });
});

describe('mergeActivityEntries', () => {
  it('keeps live entries first, replaces duplicates and appends older pages', () => {
    const updatedReceive = { ...entries[0], status: 'pending' as const };
    const olderEntry = entry('older', 'send', 'lightning');

    expect(mergeActivityEntries(
      [updatedReceive, entries[1]],
      [entries[0], olderEntry],
    )).toEqual([updatedReceive, entries[1], olderEntry]);
  });
});
