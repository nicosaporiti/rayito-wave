import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useWalletList, type Entry } from '@lightninglabs/wavelength-react';
import {
  ACTIVITY_FILTER_OPTIONS,
  activityRail,
  activityRailKey,
  filterActivity,
  isIncomingEntry,
  mergeActivityEntries,
  type ActivityFilter,
} from '../lib/activity';
import { useI18n } from '../i18n/useI18n';
import type { PendingMessage } from '../i18n/context';
import type { MessageKey } from '../i18n/messages';
import {
  entryFailureKey,
  entryKindKey,
  entryPhaseKey,
  entryStatusKey,
} from '../lib/format';
import { Dialog } from './Dialog';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronRightIcon,
} from './Icons';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

const ACTIVITY_PAGE_SIZE = 50;

type ActivityDialogProps = {
  readonly entries: readonly Entry[];
  readonly initialEntryId?: string;
  readonly onClose: () => void;
};

type ActivityRowsProps = {
  readonly entries: readonly Entry[];
  readonly focusEntryId?: string;
  readonly onSelect: (entryId: string) => void;
};

type HistoryRequestState =
  | { readonly status: 'initial-loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'loading-more' }
  | {
      readonly status: 'error';
      readonly message: PendingMessage;
      readonly retryCursor: string;
    };

/** Signals a failure whose copy lives in the catalogue rather than in the SDK. */
class HistoryError extends Error {
  constructor(readonly messageKey: MessageKey) {
    super(messageKey);
    this.name = 'HistoryError';
  }
}

function historyFailureMessage(error: unknown): PendingMessage {
  if (error instanceof HistoryError) return { key: error.messageKey };
  if (error instanceof Error) return { text: error.message };
  return { key: 'activity.error.generic' };
}

type DetailRowProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly technical?: boolean;
};

export function ActivityRows({ entries, focusEntryId, onSelect }: ActivityRowsProps): ReactElement {
  const { formatDate, formatSats, t } = useI18n();

  return (
    <ul className="activity-list">
      {entries.map((entry) => {
        const incoming = isIncomingEntry(entry);
        const rail = activityRail(entry);
        const direction = t(
          incoming ? 'activity.direction.incoming' : 'activity.direction.outgoing',
        );

        return (
          <li key={entry.id}>
            <Button
              className="activity-row"
              type="button"
              variant="ghost"
              autoFocus={entry.id === focusEntryId}
              onClick={() => onSelect(entry.id)}
              aria-label={t('activity.row.aria', {
                kind: t(entryKindKey(entry.kind)),
                direction,
                amount: formatSats(Math.abs(entry.amountSat)),
                rail: t(activityRailKey(rail)),
                status: t(entryStatusKey(entry.status)),
                date: formatDate(entry.createdAt),
              })}
            >
              <span className={`activity-icon ${incoming ? 'incoming' : ''}`}>
                {incoming ? <ArrowDownIcon /> : <ArrowUpIcon />}
              </span>
              <span className="activity-copy">
                <strong>{t(entryKindKey(entry.kind))}</strong>
                <small>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  <span>{t(activityRailKey(rail))}</span>
                  <Badge
                    className={`activity-status ${entry.status}`}
                    variant="outline"
                  >
                    {t(entryStatusKey(entry.status))}
                  </Badge>
                </small>
              </span>
              <span className={`activity-amount ${incoming ? 'positive' : ''}`}>
                {incoming ? '+' : '−'}{formatSats(Math.abs(entry.amountSat))} <small>sats</small>
              </span>
              <span className="activity-chevron"><ChevronRightIcon /></span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityDialog({ entries, initialEntryId, onClose }: ActivityDialogProps): ReactElement {
  const { plural, resolve, t } = useI18n();
  const { list } = useWalletList();
  const [history, setHistory] = useState<readonly Entry[]>(entries);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(initialEntryId ?? null);
  const [focusEntryId, setFocusEntryId] = useState<string | undefined>();
  const [requestState, setRequestState] = useState<HistoryRequestState>({
    status: 'initial-loading',
  });
  const historyHeaderRef = useRef<HTMLDivElement>(null);
  const initialRequestStarted = useRef(false);
  const mounted = useRef(true);

  const requestCompleteHistory = useCallback(async (initialCursor: string): Promise<void> => {
    let cursor = initialCursor;
    try {
      while (true) {
        const result = await list({
          cursor,
          limit: ACTIVITY_PAGE_SIZE,
          view: 'activity',
        });
        const page = result.activity;
        if (!mounted.current) return;
        if (!page) throw new HistoryError('activity.error.missingHistory');

        setHistory((current) => mergeActivityEntries(current, page.entries));
        if (!page.hasMore) break;
        if (!page.nextCursor) throw new HistoryError('activity.error.missingCursor');

        cursor = page.nextCursor;
        setRequestState({ status: 'loading-more' });
      }
      setRequestState({ status: 'ready' });
    } catch (error) {
      if (!mounted.current) return;
      setRequestState({
        status: 'error',
        message: historyFailureMessage(error),
        retryCursor: cursor,
      });
    }
  }, [list]);

  useEffect(() => {
    setHistory((current) => mergeActivityEntries(entries, current));
  }, [entries]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialRequestStarted.current) return;
    initialRequestStarted.current = true;
    void requestCompleteHistory('');
  }, [requestCompleteHistory]);

  useEffect(() => {
    if (selectedEntryId === null && focusEntryId) setFocusEntryId(undefined);
  }, [focusEntryId, selectedEntryId]);

  useEffect(() => {
    const scrollPort = historyHeaderRef.current?.closest<HTMLElement>('.action-panel-body');
    if (scrollPort) scrollPort.scrollTop = 0;
  }, [filter]);

  const retry = (): void => {
    if (requestState.status !== 'error') return;
    const cursor = requestState.retryCursor;
    if (cursor) setRequestState({ status: 'loading-more' });
    else setRequestState({ status: 'initial-loading' });
    void requestCompleteHistory(cursor);
  };

  const selectEntry = (entryId: string): void => {
    setFocusEntryId(undefined);
    setSelectedEntryId(entryId);
  };

  const returnToHistory = (): void => {
    setFocusEntryId(selectedEntryId ?? undefined);
    setSelectedEntryId(null);
  };

  const selectedEntry = selectedEntryId
    ? history.find((entry) => entry.id === selectedEntryId)
    : undefined;
  const filteredEntries = filterActivity(history, filter);

  return (
    <Dialog
      ariaLabel={t(selectedEntry ? 'activity.dialog.detail' : 'activity.dialog.history')}
      onClose={onClose}
      panelClassName="activity-dialog"
    >
      {selectedEntry ? (
        <ActivityDetail entry={selectedEntry} onBack={returnToHistory} />
      ) : (
        <div className="activity-history">
          <div ref={historyHeaderRef} className="activity-history-header">
            <header className="activity-dialog-heading">
              <span className="step-label">{t('activity.history.step')}</span>
              <h2>{t('activity.history.title')}</h2>
              <p>{plural('activity.history.loaded', history.length)}</p>
            </header>

            <div className="activity-filters" role="group" aria-label={t('activity.filters.aria')}>
              {ACTIVITY_FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  className="activity-filter"
                  type="button"
                  variant={filter === option.value ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {t(option.labelKey)}
                </Button>
              ))}
            </div>

            <p className="activity-result-count" aria-live="polite">
              {plural('activity.results', filteredEntries.length)}
            </p>
          </div>

          {filteredEntries.length > 0 ? (
            <ActivityRows
              entries={filteredEntries}
              focusEntryId={focusEntryId}
              onSelect={selectEntry}
            />
          ) : (
            <div className="activity-filter-empty">
              <p>
                {t(requestState.status === 'ready'
                  ? 'activity.filter.empty'
                  : 'activity.filter.searching')}
              </p>
            </div>
          )}

          {requestState.status === 'initial-loading' && (
            <Alert className="activity-history-message" role="status">
              <AlertDescription>{t('activity.loading.initial')}</AlertDescription>
            </Alert>
          )}
          {requestState.status === 'loading-more' && (
            <Alert className="activity-history-message" role="status">
              <AlertDescription>{t('activity.loading.more')}</AlertDescription>
            </Alert>
          )}
          {requestState.status === 'error' && (
            <Alert className="activity-history-error" variant="destructive">
              <AlertDescription>{resolve(requestState.message)}</AlertDescription>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t('activity.retry')}
              </Button>
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ActivityDetail({ entry, onBack }: { readonly entry: Entry; readonly onBack: () => void }): ReactElement {
  const { formatFullDate, formatSats, t } = useI18n();
  const incoming = isIncomingEntry(entry);
  const rail = activityRail(entry);
  const requestPaymentHash = entry.request?.paymentHash;
  const progressPaymentHash = entry.progress?.paymentHash;

  return (
    <article className="activity-detail">
      <Button
        autoFocus
        className="activity-back"
        type="button"
        variant="ghost"
        onClick={onBack}
      >
        <ArrowLeftIcon /> {t('activity.back')}
      </Button>

      <header className="activity-detail-heading">
        <div>
          <span className="step-label">{t('activity.dialog.detail')}</span>
          <h2>{t(entryKindKey(entry.kind))}</h2>
        </div>
        <p className={incoming ? 'positive' : ''}>
          {incoming ? '+' : '−'}{formatSats(Math.abs(entry.amountSat))} <small>sats</small>
        </p>
      </header>

      <div className="activity-detail-badges">
        <Badge
          className={`activity-status ${entry.status}`}
          variant={entry.status === 'failed' ? 'destructive' : 'outline'}
        >
          {t(entryStatusKey(entry.status))}
        </Badge>
        <Badge variant="secondary">{t(activityRailKey(rail))}</Badge>
        <Badge variant="outline">
          {t(incoming ? 'activity.direction.incoming' : 'activity.direction.outgoing')}
        </Badge>
      </div>

      <Separator className="activity-detail-separator" />

      <DetailSection title={t('activity.section.data')}>
        <DetailRow label={t('activity.detail.fee')} value={`${formatSats(entry.feeSat)} sats`} />
        <DetailRow label={t('activity.detail.created')} value={<time dateTime={entry.createdAt}>{formatFullDate(entry.createdAt)}</time>} />
        <DetailRow label={t('activity.detail.updated')} value={<time dateTime={entry.updatedAt}>{formatFullDate(entry.updatedAt)}</time>} />
        <DetailRow label={t('activity.detail.note')} value={entry.note || t('activity.detail.note.empty')} />
        <DetailRow label={t('activity.detail.counterparty')} value={entry.counterparty || t('activity.detail.counterparty.empty')} technical={Boolean(entry.counterparty)} />
        <DetailRow label={t('activity.detail.id')} value={entry.id} technical />
        {entry.cursor > 0 && <DetailRow label={t('activity.detail.cursor')} value={entry.cursor} technical />}
      </DetailSection>

      {entry.progress && (
        <DetailSection title={t('activity.section.progress')}>
          <DetailRow label={t('activity.detail.phase')} value={t(entryPhaseKey(entry.progress.phase))} />
          {progressPaymentHash && <DetailRow label={t('activity.detail.paymentHash')} value={progressPaymentHash} technical />}
          {entry.progress.txid && <DetailRow label={t('activity.detail.txid')} value={entry.progress.txid} technical />}
          {entry.progress.confirmationHeight > 0 && (
            <DetailRow label={t('activity.detail.confirmationHeight')} value={formatSats(entry.progress.confirmationHeight)} />
          )}
          {entry.progress.vTXOOutpoint && <DetailRow label={t('activity.detail.vtxo')} value={entry.progress.vTXOOutpoint} technical />}
          {entry.progress.preimage && <DetailRow label={t('activity.detail.preimage')} value={entry.progress.preimage} technical />}
        </DetailSection>
      )}

      {entry.request && (
        <DetailSection title={t('activity.section.request')}>
          <DetailRow label={t('activity.detail.type')} value={t(activityRailKey(entry.request.type))} />
          {entry.request.lightningInvoice && <DetailRow label={t('activity.detail.invoice')} value={entry.request.lightningInvoice} technical />}
          {requestPaymentHash && requestPaymentHash !== progressPaymentHash && (
            <DetailRow label={t('activity.detail.paymentHash')} value={requestPaymentHash} technical />
          )}
          {entry.request.onchainAddress && <DetailRow label={t('activity.detail.onchainAddress')} value={entry.request.onchainAddress} technical />}
          {entry.request.arkAddress && <DetailRow label={t('activity.detail.arkAddress')} value={entry.request.arkAddress} technical />}
        </DetailSection>
      )}

      {entry.status === 'failed' && (
        <DetailSection title={t('activity.section.error')}>
          {entry.failureCode && <DetailRow label={t('activity.detail.type')} value={t(entryFailureKey(entry.failureCode))} />}
          <DetailRow label={t('activity.detail.failureReason')} value={entry.failureReason || t('activity.detail.failureReason.empty')} />
        </DetailSection>
      )}
    </article>
  );
}

function DetailSection({ children, title }: { readonly children: ReactNode; readonly title: string }): ReactElement {
  return (
    <section className="activity-detail-section">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function DetailRow({ label, value, technical = false }: DetailRowProps): ReactElement {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{technical ? <code>{value}</code> : value}</dd>
    </div>
  );
}
