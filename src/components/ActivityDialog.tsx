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
  activityRailLabel,
  filterActivity,
  isIncomingEntry,
  mergeActivityEntries,
  type ActivityFilter,
} from '../lib/activity';
import {
  entryFailureLabel,
  entryKindLabel,
  entryPhaseLabel,
  entryStatusLabel,
  formatDate,
  formatFullDate,
  formatSats,
} from '../lib/format';
import { Dialog } from './Dialog';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronRightIcon,
} from './Icons';

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
  | { readonly status: 'error'; readonly message: string; readonly retryCursor: string };

type DetailRowProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly technical?: boolean;
};

export function ActivityRows({ entries, focusEntryId, onSelect }: ActivityRowsProps): ReactElement {
  return (
    <ul className="activity-list">
      {entries.map((entry) => {
        const incoming = isIncomingEntry(entry);
        const rail = activityRail(entry);
        const direction = incoming ? 'Ingreso' : 'Egreso';

        return (
          <li key={entry.id}>
            <button
              type="button"
              autoFocus={entry.id === focusEntryId}
              onClick={() => onSelect(entry.id)}
              aria-label={`Ver detalles: ${entryKindLabel(entry.kind)}, ${direction}, ${formatSats(Math.abs(entry.amountSat))} sats, ${activityRailLabel(rail)}, ${entryStatusLabel(entry.status)}, ${formatDate(entry.createdAt)}`}
            >
              <span className={`activity-icon ${incoming ? 'incoming' : ''}`}>
                {incoming ? <ArrowDownIcon /> : <ArrowUpIcon />}
              </span>
              <span className="activity-copy">
                <strong>{entryKindLabel(entry.kind)}</strong>
                <small>
                  <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  <span>{activityRailLabel(rail)}</span>
                  <span className={`activity-status ${entry.status}`}>
                    {entryStatusLabel(entry.status)}
                  </span>
                </small>
              </span>
              <span className={`activity-amount ${incoming ? 'positive' : ''}`}>
                {incoming ? '+' : '−'}{formatSats(Math.abs(entry.amountSat))} <small>sats</small>
              </span>
              <span className="activity-chevron"><ChevronRightIcon /></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityDialog({ entries, initialEntryId, onClose }: ActivityDialogProps): ReactElement {
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
        if (!page) throw new Error('Wavelength no devolvió el historial solicitado.');

        setHistory((current) => mergeActivityEntries(current, page.entries));
        if (!page.hasMore) break;
        if (!page.nextCursor) throw new Error('Wavelength no devolvió el cursor de la página siguiente.');

        cursor = page.nextCursor;
        setRequestState({ status: 'loading-more' });
      }
      setRequestState({ status: 'ready' });
    } catch (error) {
      if (!mounted.current) return;
      setRequestState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No pudimos cargar el historial.',
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
      ariaLabel={selectedEntry ? 'Detalle del movimiento' : 'Historial de movimientos'}
      onClose={onClose}
      panelClassName="activity-dialog"
    >
      {selectedEntry ? (
        <ActivityDetail entry={selectedEntry} onBack={returnToHistory} />
      ) : (
        <div className="activity-history">
          <div ref={historyHeaderRef} className="activity-history-header">
            <header className="activity-dialog-heading">
              <span className="step-label">Historial</span>
              <h2>Todos los movimientos</h2>
              <p>{history.length} {history.length === 1 ? 'movimiento cargado' : 'movimientos cargados'}</p>
            </header>

            <div className="activity-filters" role="group" aria-label="Filtrar movimientos">
              {ACTIVITY_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <p className="activity-result-count" aria-live="polite">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'resultado' : 'resultados'}
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
                {requestState.status === 'ready'
                  ? 'No hay movimientos que coincidan con este filtro.'
                  : 'Buscando coincidencias en el historial…'}
              </p>
            </div>
          )}

          {requestState.status === 'initial-loading' && (
            <p className="activity-history-message" role="status">Cargando el historial completo…</p>
          )}
          {requestState.status === 'loading-more' && (
            <p className="activity-history-message" role="status">Cargando más movimientos…</p>
          )}
          {requestState.status === 'error' && (
            <div className="activity-history-error">
              <p>{requestState.message}</p>
              <button type="button" onClick={retry}>Reintentar</button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ActivityDetail({ entry, onBack }: { readonly entry: Entry; readonly onBack: () => void }): ReactElement {
  const incoming = isIncomingEntry(entry);
  const rail = activityRail(entry);
  const requestPaymentHash = entry.request?.paymentHash;
  const progressPaymentHash = entry.progress?.paymentHash;

  return (
    <article className="activity-detail">
      <button autoFocus className="activity-back" type="button" onClick={onBack}>
        <ArrowLeftIcon /> Volver al historial
      </button>

      <header className="activity-detail-heading">
        <div>
          <span className="step-label">Detalle del movimiento</span>
          <h2>{entryKindLabel(entry.kind)}</h2>
        </div>
        <p className={incoming ? 'positive' : ''}>
          {incoming ? '+' : '−'}{formatSats(Math.abs(entry.amountSat))} <small>sats</small>
        </p>
      </header>

      <div className="activity-detail-badges">
        <span className={`activity-status ${entry.status}`}>{entryStatusLabel(entry.status)}</span>
        <span>{activityRailLabel(rail)}</span>
        <span>{incoming ? 'Ingreso' : 'Egreso'}</span>
      </div>

      <DetailSection title="Datos">
        <DetailRow label="Comisión" value={`${formatSats(entry.feeSat)} sats`} />
        <DetailRow label="Creado" value={<time dateTime={entry.createdAt}>{formatFullDate(entry.createdAt)}</time>} />
        <DetailRow label="Actualizado" value={<time dateTime={entry.updatedAt}>{formatFullDate(entry.updatedAt)}</time>} />
        <DetailRow label="Concepto" value={entry.note || 'Sin concepto'} />
        <DetailRow label="Contraparte" value={entry.counterparty || 'No disponible'} technical={Boolean(entry.counterparty)} />
        <DetailRow label="ID del movimiento" value={entry.id} technical />
        {entry.cursor > 0 && <DetailRow label="Cursor" value={entry.cursor} technical />}
      </DetailSection>

      {entry.progress && (
        <DetailSection title="Progreso">
          <DetailRow label="Etapa" value={entryPhaseLabel(entry.progress.phase)} />
          {progressPaymentHash && <DetailRow label="Payment hash" value={progressPaymentHash} technical />}
          {entry.progress.txid && <DetailRow label="Transaction ID" value={entry.progress.txid} technical />}
          {entry.progress.confirmationHeight > 0 && (
            <DetailRow label="Altura de confirmación" value={formatSats(entry.progress.confirmationHeight)} />
          )}
          {entry.progress.vTXOOutpoint && <DetailRow label="VTXO outpoint" value={entry.progress.vTXOOutpoint} technical />}
          {entry.progress.preimage && <DetailRow label="Preimage" value={entry.progress.preimage} technical />}
        </DetailSection>
      )}

      {entry.request && (
        <DetailSection title="Solicitud original">
          <DetailRow label="Tipo" value={activityRailLabel(entry.request.type)} />
          {entry.request.lightningInvoice && <DetailRow label="Factura Lightning" value={entry.request.lightningInvoice} technical />}
          {requestPaymentHash && requestPaymentHash !== progressPaymentHash && (
            <DetailRow label="Payment hash" value={requestPaymentHash} technical />
          )}
          {entry.request.onchainAddress && <DetailRow label="Dirección on-chain" value={entry.request.onchainAddress} technical />}
          {entry.request.arkAddress && <DetailRow label="Dirección Ark" value={entry.request.arkAddress} technical />}
        </DetailSection>
      )}

      {entry.status === 'failed' && (
        <DetailSection title="Error">
          {entry.failureCode && <DetailRow label="Tipo" value={entryFailureLabel(entry.failureCode)} />}
          <DetailRow label="Motivo" value={entry.failureReason || 'Sin más información'} />
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
