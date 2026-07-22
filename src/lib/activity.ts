import type { Entry } from '@lightninglabs/wavelength-react';

export const RECENT_ACTIVITY_LIMIT = 5;

export type ActivityFilter = 'all' | 'income' | 'expense' | 'onchain' | 'lightning';
export type ActivityRail = 'ark' | 'lightning' | 'onchain' | 'unknown';

export const ACTIVITY_FILTER_OPTIONS = [
  { label: 'Todos', value: 'all' },
  { label: 'Ingresos', value: 'income' },
  { label: 'Egresos', value: 'expense' },
  { label: 'On-chain', value: 'onchain' },
  { label: 'Lightning', value: 'lightning' },
] as const satisfies readonly { readonly label: string; readonly value: ActivityFilter }[];

export function isIncomingEntry(entry: Entry): boolean {
  return entry.kind === 'receive' || entry.kind === 'deposit';
}

export function activityRail(entry: Entry): ActivityRail {
  if (entry.request) return entry.request.type;
  if (entry.kind === 'receive') return 'lightning';
  if (entry.kind === 'deposit' || entry.kind === 'exit') return 'onchain';

  if (entry.progress?.paymentHash) return 'lightning';
  if (entry.progress?.txid) return 'onchain';

  const counterparty = entry.counterparty.trim().toLowerCase();
  if (counterparty.startsWith('ln')) return 'lightning';
  if (
    counterparty.length >= 20
    && /^(bc1|tb1|bcrt1|[13mn2])/.test(counterparty)
  ) return 'onchain';

  return 'unknown';
}

export function activityRailLabel(rail: ActivityRail): string {
  switch (rail) {
    case 'ark': return 'Ark';
    case 'lightning': return 'Lightning';
    case 'onchain': return 'On-chain';
    case 'unknown': return 'Sin identificar';
    default: return rail satisfies never;
  }
}

export function filterActivity(
  entries: readonly Entry[],
  filter: ActivityFilter,
): readonly Entry[] {
  switch (filter) {
    case 'all': return entries;
    case 'income': return entries.filter(isIncomingEntry);
    case 'expense': return entries.filter((entry) => !isIncomingEntry(entry));
    case 'onchain': return entries.filter((entry) => activityRail(entry) === 'onchain');
    case 'lightning': return entries.filter((entry) => activityRail(entry) === 'lightning');
    default: return filter satisfies never;
  }
}

export function recentActivity(entries: readonly Entry[]): readonly Entry[] {
  return entries.slice(0, RECENT_ACTIVITY_LIMIT);
}

/**
 * Keeps the first collection's ordering and newest values, then appends
 * entries that only exist in the second collection.
 */
export function mergeActivityEntries(
  leading: readonly Entry[],
  trailing: readonly Entry[],
): readonly Entry[] {
  const entriesById = new Map(trailing.map((entry) => [entry.id, entry]));
  for (const entry of leading) entriesById.set(entry.id, entry);

  const orderedIds = new Set<string>();
  const mergedEntries: Entry[] = [];
  for (const entry of [...leading, ...trailing]) {
    if (orderedIds.has(entry.id)) continue;
    orderedIds.add(entry.id);
    const mergedEntry = entriesById.get(entry.id);
    if (mergedEntry) mergedEntries.push(mergedEntry);
  }
  return mergedEntries;
}
