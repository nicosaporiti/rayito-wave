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
  Entry,
  PrepareSendResult,
  SendRequest,
  UseWalletDepositResult,
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
  ActivityIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  HomeIcon,
  LinkIcon,
} from './Icons';
import { LightningInvoiceResult } from './LightningInvoiceResult';
import { OnchainDepositStatus } from './OnchainDepositStatus';
import { QrInvoiceScanner } from './QrInvoiceScanner';
import { SignetFaucetGuide } from './SignetFaucetGuide';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

type WalletAction = 'receive' | 'deposit' | 'send';
type Action = WalletAction | null;
const DASHBOARD_VIEWS = ['home', 'activity'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];
type DashboardProps = {
  readonly onViewChange?: (view: DashboardView) => void;
  readonly view?: DashboardView;
};
type ActivityDialogState =
  | { readonly type: 'history' }
  | { readonly type: 'detail'; readonly entryId: string }
  | null;
type ActionDialogProps = {
  readonly action: WalletAction;
  readonly depositController: UseWalletDepositResult;
  readonly depositEntry: Entry | null;
  readonly onClose: () => void;
  readonly onInvoiceCreated: (entryId: string) => void;
};
type PaymentToastProps = { readonly notice: PaymentNotice; readonly onDismiss: () => void };
type ReceiveFormProps = { readonly onInvoiceCreated: (entryId: string) => void };
type MovementsViewProps = {
  readonly entries: readonly Entry[];
  readonly onDeposit: () => void;
  readonly onOpenDetail: (entryId: string) => void;
  readonly onOpenHistory: () => void;
};
type BalanceScale = 'compact' | 'default' | 'medium';

const ACTION_DIALOG_LABELS = {
  deposit: 'Fondear wallet',
  receive: 'Recibir por Lightning',
  send: 'Enviar pago',
} as const satisfies Record<WalletAction, string>;
const RECEIVE_PROGRESS_PERCENT = {
  route: 28,
  slow: 88,
  swap: 68,
} as const satisfies Record<ReturnType<typeof receiveProgressFor>['stage'], number>;

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function balanceScaleFor(formattedBalance: string): BalanceScale {
  if (formattedBalance.length >= 16) return 'compact';
  if (formattedBalance.length >= 11) return 'medium';
  return 'default';
}

function isDashboardView(value: string): value is DashboardView {
  return DASHBOARD_VIEWS.some((view) => view === value);
}

export function Dashboard({
  onViewChange,
  view,
}: DashboardProps = {}) {
  const balance = useWalletBalance();
  const info = useWalletInfo();
  const activity = useWalletActivity();
  const depositController = useWalletDeposit();
  const [action, setAction] = useState<Action>(null);
  const [internalView, setInternalView] = useState<DashboardView>('home');
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
  const confirmedSat = balance?.confirmedSat ?? 0;
  const blockHeight = info?.blockHeight ?? 0;
  const depositEntry = depositController.depositData
    ? activity.find((entry) => (
        entry.kind === 'deposit'
        && (
          entry.id === depositController.depositData?.entry.id
          || entry.request?.onchainAddress === depositController.depositData?.address
        )
      )) ?? depositController.depositData.entry
    : null;
  const formattedConfirmedSat = formatSats(confirmedSat);
  const balanceScale = balanceScaleFor(formattedConfirmedSat);
  const activeView = view ?? internalView;
  const selectView = (nextView: DashboardView): void => {
    if (view === undefined) setInternalView(nextView);
    onViewChange?.(nextView);
  };
  const changeView = (value: string): void => {
    if (isDashboardView(value)) selectView(value);
  };

  return (
    <main className="dashboard">
      <Tabs className="dashboard-tabs" value={activeView} onValueChange={changeView}>
        <Card className="dashboard-surface">
          <TabsContent className="dashboard-view dashboard-home-view" value="home">
            <section className="balance-panel" aria-labelledby="balance-heading">
              <header className="balance-header">
                <span className="balance-label" id="balance-heading">Saldo disponible</span>
                <Badge
                  className="connection"
                  variant="outline"
                  aria-label={`Conectado, bloque ${blockHeight}`}
                >
                  <span className="connection-dot" aria-hidden="true" />
                  En línea
                </Badge>
              </header>

              <div className="balance-total">
                <p className="balance-number" data-balance-scale={balanceScale}>
                  <strong>{formattedConfirmedSat}</strong>
                  <span>sats</span>
                </p>
                <div className="balance-meta" aria-live="polite">
                  {!hasPendingBalance && <span className="balance-ready">Saldo listo para usar</span>}
                  {pendingInSat > 0 && (
                    <span><strong>+{formatSats(pendingInSat)}</strong> entrando</span>
                  )}
                  {pendingOutSat > 0 && (
                    <span><strong>−{formatSats(pendingOutSat)}</strong> saliendo</span>
                  )}
                </div>
              </div>

              {depositController.depositData && depositEntry && action !== 'deposit' && (
                <OnchainDepositStatus
                  address={depositController.depositData.address}
                  entry={depositEntry}
                />
              )}

              <div className="balance-actions" role="group" aria-label="Acciones de la wallet">
                <Button
                  className="quick-action"
                  type="button"
                  variant="ghost"
                  aria-pressed={action === 'send'}
                  onClick={() => openAction('send')}
                >
                  <span className="quick-action-icon"><ArrowUpIcon /></span>
                  <strong>Enviar</strong>
                </Button>
                <Button
                  className="quick-action"
                  type="button"
                  variant="ghost"
                  aria-pressed={action === 'receive'}
                  onClick={() => openAction('receive')}
                >
                  <span className="quick-action-icon"><ArrowDownIcon /></span>
                  <strong>Recibir</strong>
                </Button>
                <Button
                  className="quick-action"
                  type="button"
                  variant="ghost"
                  aria-pressed={action === 'deposit'}
                  onClick={() => openAction('deposit')}
                >
                  <span className="quick-action-icon"><LinkIcon /></span>
                  <strong>Fondear</strong>
                </Button>
              </div>

              <Separator className="dashboard-separator" />

              <dl className="balance-breakdown" aria-label="Desglose del saldo">
                <div className="balance-metric">
                  <dt>Disponible</dt>
                  <dd>{formattedConfirmedSat} <small>sats</small></dd>
                </div>
                <div className="balance-metric">
                  <dt>Entrando</dt>
                  <dd>+{formatSats(pendingInSat)} <small>sats</small></dd>
                </div>
                <div className="balance-metric">
                  <dt>Saliendo</dt>
                  <dd>−{formatSats(pendingOutSat)} <small>sats</small></dd>
                </div>
                <div className="balance-metric network-metric">
                  <dt>Red · bloque</dt>
                  <dd>Signet <small>#{formatSats(blockHeight)}</small></dd>
                </div>
              </dl>
            </section>

            <RecoveryBanner />
          </TabsContent>

          <TabsContent className="dashboard-view dashboard-activity-view" value="activity">
            <MovementsView
              entries={activity}
              onDeposit={() => openAction('deposit')}
              onOpenDetail={(entryId) => setActivityDialog({ type: 'detail', entryId })}
              onOpenHistory={() => setActivityDialog({ type: 'history' })}
            />
          </TabsContent>

          <TabsList className="dashboard-nav" aria-label="Secciones de la wallet">
            <TabsTrigger
              className="dashboard-nav-item"
              value="home"
              onClick={() => selectView('home')}
            >
              <HomeIcon />
              <span>Inicio</span>
            </TabsTrigger>
            <TabsTrigger
              className="dashboard-nav-item"
              value="activity"
              aria-label={`Movimientos, ${activity.length}`}
              onClick={() => selectView('activity')}
            >
              <ActivityIcon />
              <span>Movimientos</span>
              {activity.length > 0 && (
                <span className="dashboard-nav-count" aria-hidden="true">
                  {activity.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Card>
      </Tabs>

      {action && (
        <ActionDialog
          action={action}
          depositController={depositController}
          depositEntry={depositEntry}
          onClose={closeAction}
          onInvoiceCreated={trackInvoice}
        />
      )}
      {notice?.type === 'received' && (
        <ReceivedFundsWash key={notice.entryId} />
      )}
      {notice && <PaymentToast notice={notice} onDismiss={() => setNotice(null)} />}
      {activityDialog && (
        <ActivityDialog
          entries={activity}
          initialEntryId={activityDialog.type === 'detail' ? activityDialog.entryId : undefined}
          onClose={() => setActivityDialog(null)}
        />
      )}
    </main>
  );
}

function MovementsView({
  entries,
  onDeposit,
  onOpenDetail,
  onOpenHistory,
}: MovementsViewProps) {
  const visibleEntries = recentActivity(entries);
  const countLabel = entries.length === 1 ? '1 movimiento' : `${entries.length} movimientos`;

  return (
    <section className="activity-section activity-page" aria-labelledby="activity-heading">
      <div className="section-title">
        <div>
          <span className="step-label">Movimientos</span>
          <h2 id="activity-heading">Actividad reciente</h2>
        </div>
        <Badge className="activity-count" variant="outline" aria-label={countLabel}>
          {entries.length}
        </Badge>
      </div>

      <div className="activity-page-body">
        {entries.length === 0 ? (
          <div className="empty-activity">
            <span className="empty-activity-icon"><ArrowDownIcon /></span>
            <h3>Probá Rayito con sats de prueba</h3>
            <p>
              Signet es una red de prueba: sus sats no tienen valor real.
              Generá una dirección y pedilos gratis en un faucet.
            </p>
            <Button
              className="empty-activity-action"
              type="button"
              variant="ghost"
              onClick={onDeposit}
            >
              Conseguir sats de prueba
              <ChevronRightIcon />
            </Button>
          </div>
        ) : (
          <ActivityRows entries={visibleEntries} onSelect={onOpenDetail} />
        )}
      </div>

      {entries.length > 0 && (
        <div className="activity-page-footer">
          <Button
            className="activity-see-all"
            type="button"
            variant="ghost"
            onClick={onOpenHistory}
          >
            Ver historial completo <ChevronRightIcon />
          </Button>
        </div>
      )}
    </section>
  );
}

function ActionDialog({
  action,
  depositController,
  depositEntry,
  onClose,
  onInvoiceCreated,
}: ActionDialogProps) {
  let form;
  switch (action) {
    case 'receive':
      form = <ReceiveForm onInvoiceCreated={onInvoiceCreated} />;
      break;
    case 'deposit':
      form = (
        <DepositForm
          controller={depositController}
          entry={depositEntry}
        />
      );
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
      <Button
        className="payment-toast-close"
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        aria-label="Cerrar alerta"
      >
        ×
      </Button>
    </aside>,
    document.body,
  );
}

function ReceivedFundsWash() {
  return createPortal(
    <div className="received-funds-wash" aria-hidden="true" />,
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
            <Input
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
            <Input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="Café, cena, regalo…"
              disabled={receivePending}
            />
          </label>
          {amount && !amountResult.valid && <FormError message={amountResult.error} />}
          {receiveError && <FormError message={receiveError.message} />}
          <Button
            className="primary-button"
            type="submit"
            disabled={!amountResult.valid || receivePending}
          >
            {receivePending ? `Generando · ${elapsedSeconds}s` : 'Crear factura'}
            <ArrowDownIcon />
          </Button>
          {receivePending && (
            <Alert
              className={`receive-progress ${progress.stage}`}
              role="status"
              aria-live="polite"
            >
              <div className="receive-progress-copy">
                <AlertTitle>{progress.title}</AlertTitle>
                <AlertDescription>{progress.detail}</AlertDescription>
                <time>{elapsedSeconds}s</time>
              </div>
              <Progress
                className="receive-progress-bar"
                value={RECEIVE_PROGRESS_PERCENT[progress.stage]}
                aria-label="Progreso de generación de la factura"
              />
            </Alert>
          )}
        </form>
      )}
    </div>
  );
}

function DepositForm({
  controller,
  entry,
}: {
  readonly controller: UseWalletDepositResult;
  readonly entry: Entry | null;
}) {
  const {
    deposit,
    depositPending,
    depositData,
    depositError,
  } = controller;
  const canStartAnotherDeposit = entry?.status === 'complete' || entry?.status === 'failed';
  const requestDeposit = async (): Promise<void> => {
    try { await deposit(); } catch { /* Error is rendered from depositError. */ }
  };

  return (
    <div className="deposit-view">
      <span className="step-label">Bitcoin on-chain · Signet</span>
      <h2>Fondear tu wallet</h2>
      <p>Rayito usa Signet, una red de prueba de Bitcoin. Estos sats no tienen valor real y no sirven en mainnet.</p>
      {depositData ? (
        <>
          <ResultBox label="Dirección Signet" value={depositData.address} />
          {entry && <OnchainDepositStatus address={depositData.address} entry={entry} />}
          {canStartAnotherDeposit && (
            <Button
              className="new-deposit-button"
              type="button"
              variant="outline"
              onClick={() => void requestDeposit()}
              disabled={depositPending}
            >
              {depositPending ? 'Generando…' : 'Generar otra dirección'}
              <LinkIcon />
            </Button>
          )}
          <SignetFaucetGuide address={depositData.address} />
        </>
      ) : (
        <>
          <p className="deposit-hint">Generá una dirección para pedir sats de prueba. Cuando se confirme el depósito, el saldo entra a Ark y queda listo para usar.</p>
          {depositError && <FormError message={depositError.message} />}
          <Button
            className="primary-button"
            type="button"
            onClick={() => void requestDeposit()}
            disabled={depositPending}
          >
            {depositPending ? 'Generando…' : 'Generar dirección Signet'}
            <LinkIcon />
          </Button>
        </>
      )}
    </div>
  );
}

function SendForm() {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PrepareSendResult | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
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
  const useScannedInvoice = useCallback((invoice: string): void => {
    setDestination(invoice);
    setAmount('');
    setScannerOpen(false);
  }, []);

  if (sendData) {
    return (
      <div className="send-success">
        <span className="step-label">Listo</span>
        <h2>Pago enviado</h2>
        <Alert role="status" aria-live="polite">
          <AlertTitle>Envío confirmado</AlertTitle>
          <AlertDescription>
            Se enviaron {formatSats(sendData.actualAmountSat)} sats.
            Podés seguir el estado en la actividad.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const invalidAmount = !isLightning && !amountResult.valid;
  let heading = '¿A dónde enviamos?';
  if (scannerOpen) heading = 'Pagar con QR';
  if (quote) heading = 'Revisá el pago';

  return (
    <div className="send-view">
      <span className="step-label">Enviar</span>
      <h2>{heading}</h2>
      {quote && (
        <div className="quote">
          <dl className="quote-summary">
            <div>
              <dt>Monto</dt>
              <dd>{formatSats(quote.amountSat)} sats</dd>
            </div>
            <div>
              <dt>Comisión estimada</dt>
              <dd>
                {quote.feeKnown
                  ? `${formatSats(quote.expectedFeeSat)} sats`
                  : 'A confirmar'}
              </dd>
            </div>
            <div>
              <dt>Vía</dt>
              <dd>{quote.rail}</dd>
            </div>
          </dl>
          {quote.warning && (
            <Alert className="warning-strip">
              <AlertDescription>{quote.warning}</AlertDescription>
            </Alert>
          )}
          {sendError && <FormError message={sendError.message} />}
          <div className="form-actions">
            <Button
              className="primary-button"
              type="button"
              onClick={() => void confirmSend()}
              disabled={sendPending}
            >
              {sendPending ? 'Enviando…' : 'Confirmar envío'}
              <ArrowUpIcon />
            </Button>
            <Button
              className="text-button"
              type="button"
              variant="ghost"
              onClick={() => setQuote(null)}
            >
              Editar
            </Button>
          </div>
        </div>
      )}
      {!quote && scannerOpen && (
        <QrInvoiceScanner
          onCancel={() => setScannerOpen(false)}
          onScan={useScannedInvoice}
        />
      )}
      {!quote && !scannerOpen && (
        <form onSubmit={(event) => void preview(event)}>
          <label className="field">
            <span>Factura Lightning o dirección</span>
            <Textarea
              rows={3}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="lnbc… o tb1…"
            />
          </label>
          <Button
            className="scan-invoice-button"
            type="button"
            variant="outline"
            onClick={() => setScannerOpen(true)}
          >
            <CameraIcon />
            Escanear QR con la cámara
          </Button>
          {!isLightning && (
            <label className="field">
              <span>Monto en sats</span>
              <Input
                inputMode="numeric"
                maxLength={16}
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
          {amount && invalidAmount && <FormError message={amountResult.error} />}
          {prepareError && <FormError message={prepareError.message} />}
          <Button
            className="primary-button"
            type="submit"
            disabled={!destination.trim() || invalidAmount || preparePending}
          >
            {preparePending ? 'Cotizando…' : 'Revisar pago'}
            <ArrowUpIcon />
          </Button>
        </form>
      )}
    </div>
  );
}

function ResultBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="result-box">
      <span>{label}</span>
      <code>{value}</code>
      <Button type="button" variant="outline" onClick={() => void copy()}>
        <CopyIcon /> {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}

function FormError({ message }: { readonly message: string }) {
  return (
    <Alert className="form-error" variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
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
      <Alert className="recovery-banner" role="status" aria-live="polite">
        <AlertTitle>Recuperando la wallet</AlertTitle>
        <AlertDescription>
          Estamos reconstruyendo tu saldo e historial. No cierres ni recargues esta pestaña.
        </AlertDescription>
      </Alert>
    );
  }
  if (recovery.status === 'done') {
    return (
      <Alert className="recovery-banner" role="status" aria-live="polite">
        <AlertTitle>Recuperación terminada</AlertTitle>
        <AlertDescription>{recoveryResultMessage(recovery.result)}</AlertDescription>
        <AlertAction>
          <Button type="button" variant="ghost" size="sm" onClick={acknowledge}>
            Cerrar
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  return (
    <Alert className="recovery-banner error" variant="destructive">
      <AlertDescription>
        No pudimos completar la recuperación: {recovery.error.message}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="sm" onClick={acknowledge}>
          Cerrar
        </Button>
      </AlertAction>
    </Alert>
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
