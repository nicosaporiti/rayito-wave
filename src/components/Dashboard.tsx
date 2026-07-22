import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  CreateWalletResult,
  PrepareSendResult,
  SendRequest,
} from '@lightninglabs/wavelength-react';
import {
  useWalletActivity,
  useWalletBalance,
  useWalletDeposit,
  useWalletInfo,
  useWalletPrepareSend,
  useWalletReceive,
  useWalletRecovery,
  useWalletSend,
} from '@lightninglabs/wavelength-react';
import { recentActivity } from '../lib/activity';
import { formatSats } from '../lib/format';
import {
  activityStatusIndex,
  settledPaymentNotice,
  type PaymentNotice,
} from '../lib/payment-notice';
import { receiveProgressFor } from '../lib/receive-progress';
import { parseSatoshiAmount } from '../lib/validation';
import { ActivityDialog, ActivityRows } from './ActivityDialog';
import { Dialog } from './Dialog';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  LinkIcon,
} from './Icons';
import { LightningInvoiceResult } from './LightningInvoiceResult';

type WalletAction = 'receive' | 'deposit' | 'send';
type Action = WalletAction | null;
type ActivityDialogState =
  | { readonly type: 'history' }
  | { readonly type: 'detail'; readonly entryId: string }
  | null;
type ActionDialogProps = {
  readonly action: WalletAction;
  readonly onClose: () => void;
  readonly onInvoiceCreated: (entryId: string) => void;
};
type PaymentToastProps = { readonly notice: PaymentNotice; readonly onDismiss: () => void };
type ReceiveFormProps = { readonly onInvoiceCreated: (entryId: string) => void };

const ACTION_DIALOG_LABELS = {
  deposit: 'Fondear wallet',
  receive: 'Recibir por Lightning',
  send: 'Enviar pago',
} as const satisfies Record<WalletAction, string>;

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function Dashboard() {
  const balance = useWalletBalance();
  const info = useWalletInfo();
  const activity = useWalletActivity();
  const [action, setAction] = useState<Action>(null);
  const [activityDialog, setActivityDialog] = useState<ActivityDialogState>(null);
  const [notice, setNotice] = useState<PaymentNotice | null>(null);
  const [activeReceiveEntryId, setActiveReceiveEntryId] = useState<string | null>(null);
  const previousActivityStatuses = useRef<ReturnType<typeof activityStatusIndex> | null>(null);

  const openAction = (nextAction: WalletAction): void => {
    setActiveReceiveEntryId(null);
    setAction(nextAction);
  };
  const closeAction = useCallback((): void => {
    setActiveReceiveEntryId(null);
    setAction(null);
  }, []);
  const trackInvoice = useCallback((entryId: string): void => {
    setActiveReceiveEntryId(entryId);
  }, []);

  useEffect(() => {
    const nextNotice = settledPaymentNotice(
      activity,
      previousActivityStatuses.current,
      activeReceiveEntryId,
    );
    previousActivityStatuses.current = activityStatusIndex(activity);
    if (!nextNotice) return;

    setNotice(nextNotice);
    if (
      action === 'receive'
      && nextNotice.type === 'received'
      && nextNotice.entryId === activeReceiveEntryId
    ) {
      closeAction();
    }
  }, [action, activeReceiveEntryId, activity, closeAction]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pendingInSat = balance?.pendingInSat ?? 0;
  const pendingOutSat = balance?.pendingOutSat ?? 0;
  const hasPendingBalance = pendingInSat > 0 || pendingOutSat > 0;

  return (
    <main className="dashboard">
      <section className="balance-panel" aria-labelledby="balance-heading">
        <div className="balance-top">
          <div>
            <span className="balance-label" id="balance-heading">Saldo disponible</span>
            <p className="balance-number"><strong>{formatSats(balance?.confirmedSat ?? 0)}</strong><span>sats</span></p>
          </div>
          <div className="connection" aria-label={`Conectado, bloque ${info?.blockHeight ?? 0}`}>
            <span aria-hidden="true" />
            <strong>En línea</strong>
            <small>#{formatSats(info?.blockHeight ?? 0)}</small>
          </div>
        </div>

        <div className="balance-meta" aria-live="polite">
          {!hasPendingBalance && <span className="balance-ready">Saldo listo para usar</span>}
          {pendingInSat > 0 && <span><strong>+{formatSats(pendingInSat)}</strong> entrando</span>}
          {pendingOutSat > 0 && <span><strong>−{formatSats(pendingOutSat)}</strong> saliendo</span>}
        </div>

        <div className="balance-actions" role="group" aria-label="Acciones de la wallet">
          <button type="button" aria-pressed={action === 'receive'} onClick={() => openAction('receive')}><span><ArrowDownIcon /></span><strong>Recibir</strong></button>
          <button type="button" aria-pressed={action === 'send'} onClick={() => openAction('send')}><span><ArrowUpIcon /></span><strong>Enviar</strong></button>
          <button type="button" aria-pressed={action === 'deposit'} onClick={() => openAction('deposit')}><span><LinkIcon /></span><strong>On-chain</strong></button>
        </div>
      </section>

      <RecoveryBanner />
      {action && (
        <ActionDialog
          action={action}
          onClose={closeAction}
          onInvoiceCreated={trackInvoice}
        />
      )}
      {notice && <PaymentToast notice={notice} onDismiss={() => setNotice(null)} />}
      {activityDialog && (
        <ActivityDialog
          entries={activity}
          initialEntryId={activityDialog.type === 'detail' ? activityDialog.entryId : undefined}
          onClose={() => setActivityDialog(null)}
        />
      )}

      <section className="activity-section" aria-labelledby="activity-heading">
        <div className="section-title">
          <div><span className="step-label">Movimientos</span><h2 id="activity-heading">Actividad reciente</h2></div>
          {activity.length > 0 && (
            <button type="button" onClick={() => setActivityDialog({ type: 'history' })}>
              Ver todos <ChevronRightIcon />
            </button>
          )}
        </div>
        {activity.length === 0 ? (
          <div className="empty-activity"><span><ArrowDownIcon /></span><h3>Tu wallet está lista</h3><p>Recibí sats por Lightning o pedí una dirección para fondearla desde Bitcoin.</p></div>
        ) : (
          <ActivityRows
            entries={recentActivity(activity)}
            onSelect={(entryId) => setActivityDialog({ type: 'detail', entryId })}
          />
        )}
      </section>
    </main>
  );
}

function ActionDialog({ action, onClose, onInvoiceCreated }: ActionDialogProps) {
  let form;
  switch (action) {
    case 'receive':
      form = <ReceiveForm onInvoiceCreated={onInvoiceCreated} />;
      break;
    case 'deposit':
      form = <DepositForm />;
      break;
    case 'send':
      form = <SendForm />;
      break;
  }

  return (
    <Dialog ariaLabel={ACTION_DIALOG_LABELS[action]} onClose={onClose}>
      {form}
    </Dialog>
  );
}

function PaymentToast({ notice, onDismiss }: PaymentToastProps) {
  const received = notice.type === 'received';
  const title = received ? 'Pago recibido' : 'Pago confirmado';
  const detail = received
    ? `${formatSats(notice.amountSat)} sats ya están disponibles.`
    : `${formatSats(notice.amountSat)} sats fueron enviados correctamente.`;

  return createPortal(
    <aside className="payment-toast" role="status" aria-live="polite">
      <span className="payment-toast-icon"><CheckIcon /></span>
      <div><strong>{title}</strong><p>{detail}</p></div>
      <button type="button" onClick={onDismiss} aria-label="Cerrar alerta">×</button>
    </aside>,
    document.body,
  );
}

function ReceiveForm({ onInvoiceCreated }: ReceiveFormProps) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const { receive, receivePending, receiveData, receiveError } = useWalletReceive();
  const amountResult = parseSatoshiAmount(amount);

  useEffect(() => {
    if (!receivePending) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [receivePending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!amountResult.valid) return;
    setElapsedSeconds(0);
    try {
      const result = await receive({ amountSat: amountResult.amountSat, memo });
      onInvoiceCreated(result.entry.id);
    } catch { /* Error is rendered from receiveError. */ }
  };
  const progress = receiveProgressFor(elapsedSeconds);

  return (
    <div className={`receive-view${receiveData ? ' invoice-ready' : ''}`}>
      <span className="step-label">Lightning</span>
      <h2>Recibir sats</h2>
      {receiveData ? (
        <LightningInvoiceResult
          amountSat={Math.abs(receiveData.entry.amountSat)}
          invoice={receiveData.invoice}
        />
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Monto en sats</span>
            <input
              inputMode="numeric"
              maxLength={16}
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
              placeholder="1.000"
              disabled={receivePending}
            />
          </label>
          <label className="field">
            <span>Concepto (opcional)</span>
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="Café, cena, regalo…"
              disabled={receivePending}
            />
          </label>
          {amount && !amountResult.valid && <p className="form-error" role="alert">{amountResult.error}</p>}
          {receiveError && <p className="form-error">{receiveError.message}</p>}
          <button className="primary-button" disabled={!amountResult.valid || receivePending}>
            {receivePending ? `Generando · ${elapsedSeconds}s` : 'Crear factura'}
            <ArrowDownIcon />
          </button>
          {receivePending && (
            <div
              className={`receive-progress ${progress.stage}`}
              role="status"
              aria-live="polite"
            >
              <span className="receive-progress-dot" />
              <div><strong>{progress.title}</strong><p>{progress.detail}</p></div>
              <time>{elapsedSeconds}s</time>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

function DepositForm() {
  const { deposit, depositPending, depositData, depositError } = useWalletDeposit();
  const requestDeposit = async () => {
    try { await deposit(); } catch { /* Error is rendered from depositError. */ }
  };
  return <div><span className="step-label">Bitcoin on-chain</span><h2>Fondear tu wallet</h2><p>Generá una dirección de ingreso en Signet. El saldo entra a Ark después de la confirmación.</p>{depositData ? <ResultBox label="Dirección Signet" value={depositData.address} /> : <>{depositError && <p className="form-error">{depositError.message}</p>}<button className="primary-button" onClick={() => void requestDeposit()} disabled={depositPending}>{depositPending ? 'Generando…' : 'Generar dirección'} <LinkIcon /></button></>}</div>;
}

function SendForm() {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PrepareSendResult | null>(null);
  const { prepare, preparePending, prepareError } = useWalletPrepareSend();
  const { sendPrepared, sendPending, sendError, sendData } = useWalletSend();

  const isLightning = destination.trim().toLowerCase().startsWith('ln');
  const amountResult = parseSatoshiAmount(amount);
  const request = (): SendRequest | null => {
    if (isLightning) return { invoice: destination.trim() };
    if (!amountResult.valid) return null;
    return { onchainAddress: destination.trim(), amountSat: amountResult.amountSat };
  };
  const preview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sendRequest = request();
    if (!sendRequest) return;
    try { setQuote(await prepare(sendRequest)); } catch { /* Error is rendered from prepareError. */ }
  };
  const confirmSend = async () => {
    if (!quote) return;
    try { await sendPrepared(quote); } catch { /* Error is rendered from sendError. */ }
  };

  if (sendData) return <div><span className="step-label">Listo</span><h2>Pago enviado</h2><p>Se enviaron {formatSats(sendData.actualAmountSat)} sats. Podés seguir el estado en la actividad.</p></div>;
  const invalidAmount = !isLightning && !amountResult.valid;
  return <div><span className="step-label">Enviar</span><h2>{quote ? 'Revisá el pago' : '¿A dónde enviamos?'}</h2>{quote ? <div className="quote"><dl><div><dt>Monto</dt><dd>{formatSats(quote.amountSat)} sats</dd></div><div><dt>Comisión estimada</dt><dd>{quote.feeKnown ? `${formatSats(quote.expectedFeeSat)} sats` : 'A confirmar'}</dd></div><div><dt>Vía</dt><dd>{quote.rail}</dd></div></dl>{quote.warning && <p className="warning-strip">{quote.warning}</p>}{sendError && <p className="form-error">{sendError.message}</p>}<button className="primary-button" onClick={() => void confirmSend()} disabled={sendPending}>{sendPending ? 'Enviando…' : 'Confirmar envío'} <ArrowUpIcon /></button><button className="text-button" onClick={() => setQuote(null)}>Editar</button></div> : <form onSubmit={(event) => void preview(event)}><label className="field"><span>Factura Lightning o dirección</span><textarea rows={3} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="lnbc… o tb1…" /></label>{!isLightning && <label className="field"><span>Monto en sats</span><input inputMode="numeric" maxLength={16} value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} /></label>}{amount && invalidAmount && <p className="form-error" role="alert">{amountResult.error}</p>}{prepareError && <p className="form-error">{prepareError.message}</p>}<button className="primary-button" disabled={!destination.trim() || invalidAmount || preparePending}>{preparePending ? 'Cotizando…' : 'Revisar pago'} <ArrowUpIcon /></button></form>}</div>;
}

function ResultBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await copyText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return <div className="result-box"><span>{label}</span><code>{value}</code><button onClick={() => void copy()}><CopyIcon /> {copied ? 'Copiado' : 'Copiar'}</button></div>;
}

function RecoveryBanner() {
  const { recovery, acknowledge } = useWalletRecovery();

  useEffect(() => {
    if (recovery.status === 'done') {
      const {
        recoveredBoardingAddresses,
        recoveredBoardingUTXOs,
        recoveredOORReceiveScripts,
        recoveredOORRecipientEvents,
        recoveredVTXOs,
        recoveryRan,
      } = recovery.result;
      console.info('[Rayito] Recuperación finalizada', {
        recoveredBoardingAddresses,
        recoveredBoardingUTXOs,
        recoveredOORReceiveScripts,
        recoveredOORRecipientEvents,
        recoveredVTXOs,
        recoveryRan,
      });
    }

    if (recovery.status === 'failed') {
      console.error('[Rayito] La recuperación falló', recovery.error);
    }
  }, [recovery]);

  if (recovery.status === 'idle') return null;
  if (recovery.status === 'restoring') {
    return (
      <p className="recovery-banner" role="status" aria-live="polite">
        Estamos reconstruyendo tu saldo e historial. No cierres ni recargues esta pestaña.
      </p>
    );
  }
  if (recovery.status === 'done') {
    return (
      <p className="recovery-banner" role="status" aria-live="polite">
        {recoveryResultMessage(recovery.result)} <button onClick={acknowledge}>Cerrar</button>
      </p>
    );
  }
  return (
    <p className="recovery-banner error" role="alert">
      No pudimos completar la recuperación: {recovery.error.message}{' '}
      <button onClick={acknowledge}>Cerrar</button>
    </p>
  );
}

function recoveryResultMessage(result: CreateWalletResult): string {
  const recoveredItems = result.recoveredVTXOs
    + result.recoveredBoardingUTXOs
    + result.recoveredOORRecipientEvents;

  if (!result.recoveryRan) {
    return 'La wallet abrió, pero el SDK no ejecutó el escaneo de recuperación.';
  }
  if (recoveredItems === 0) {
    return 'El escaneo terminó, pero no encontró fondos ni movimientos recuperables.';
  }
  return `Recuperación completa: ${result.recoveredVTXOs} VTXOs, ${result.recoveredBoardingUTXOs} depósitos on-chain y ${result.recoveredOORRecipientEvents} recepciones encontradas.`;
}
