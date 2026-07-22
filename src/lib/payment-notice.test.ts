import type { EntryStatus } from '@lightninglabs/wavelength-react';
import { describe, expect, it } from 'vitest';
import { activityStatusIndex, settledPaymentNotice } from './payment-notice';

const pendingStatuses = new Map<string, EntryStatus>([
  ['receive-1', 'pending'],
  ['send-1', 'pending'],
  ['deposit-1', 'pending'],
]);

describe('settledPaymentNotice', () => {
  it('does not announce historical entries on first load', () => {
    expect(settledPaymentNotice([
      { id: 'receive-1', kind: 'receive', status: 'complete', amountSat: 1_000 },
    ], null)).toBeNull();
    expect(settledPaymentNotice([
      { id: 'receive-new', kind: 'receive', status: 'complete', amountSat: 1_000 },
    ], new Map())).toBeNull();
  });

  it('announces a newly completed receive', () => {
    expect(settledPaymentNotice([
      { id: 'receive-1', kind: 'receive', status: 'complete', amountSat: 1_000 },
    ], pendingStatuses)).toEqual({
      amountSat: 1_000,
      entryId: 'receive-1',
      type: 'received',
    });
  });

  it('announces a newly completed send with a positive display amount', () => {
    expect(settledPaymentNotice([
      { id: 'send-1', kind: 'send', status: 'complete', amountSat: -2_500 },
    ], pendingStatuses)).toEqual({
      amountSat: 2_500,
      entryId: 'send-1',
      type: 'sent',
    });
  });

  it('prioritizes the visible invoice even if its pending event was missed', () => {
    expect(settledPaymentNotice([
      { id: 'send-1', kind: 'send', status: 'complete', amountSat: -2_500 },
      { id: 'receive-visible', kind: 'receive', status: 'complete', amountSat: 3_000 },
    ], null, 'receive-visible')).toEqual({
      amountSat: 3_000,
      entryId: 'receive-visible',
      type: 'received',
    });
  });

  it('ignores deposits and entries that were already complete', () => {
    const completedStatuses = new Map<string, EntryStatus>([['receive-1', 'complete']]);

    expect(settledPaymentNotice([
      { id: 'receive-1', kind: 'receive', status: 'complete', amountSat: 1_000 },
    ], completedStatuses)).toBeNull();
    expect(settledPaymentNotice([
      { id: 'deposit-1', kind: 'deposit', status: 'complete', amountSat: 10_000 },
    ], pendingStatuses)).toBeNull();
  });
});

describe('activityStatusIndex', () => {
  it('indexes the latest status by activity id', () => {
    expect(activityStatusIndex([
      { id: 'receive-1', kind: 'receive', status: 'pending', amountSat: 1_000 },
      { id: 'send-1', kind: 'send', status: 'complete', amountSat: -500 },
    ])).toEqual(new Map([
      ['receive-1', 'pending'],
      ['send-1', 'complete'],
    ]));
  });
});
