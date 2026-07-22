import type { Entry, EntryStatus } from '@lightninglabs/wavelength-react';

type NoticeEntry = Pick<Entry, 'amountSat' | 'id' | 'kind' | 'status'>;

export type PaymentNotice = {
  readonly amountSat: number;
  readonly entryId: string;
  readonly type: 'received' | 'sent';
};

export function activityStatusIndex(entries: readonly NoticeEntry[]): ReadonlyMap<string, EntryStatus> {
  return new Map(entries.map((entry) => [entry.id, entry.status]));
}

export function settledPaymentNotice(
  entries: readonly NoticeEntry[],
  previousStatuses: ReadonlyMap<string, EntryStatus> | null,
  preferredEntryId: string | null = null,
): PaymentNotice | null {
  const preferredEntry = entries.find((entry) => (
    entry.id === preferredEntryId
    && (entry.kind === 'receive' || entry.kind === 'send')
    && entry.status === 'complete'
  ));
  if (!previousStatuses && !preferredEntry) return null;

  const transitionedEntry = previousStatuses && entries.find((entry) => (
    (entry.kind === 'receive' || entry.kind === 'send')
    && entry.status === 'complete'
    && previousStatuses.get(entry.id) === 'pending'
  ));
  const settledEntry = preferredEntry ?? transitionedEntry;

  if (!settledEntry) return null;

  const amountSat = Math.abs(settledEntry.amountSat);

  if (settledEntry.kind === 'receive') {
    return { amountSat, entryId: settledEntry.id, type: 'received' };
  }
  return { amountSat, entryId: settledEntry.id, type: 'sent' };
}
