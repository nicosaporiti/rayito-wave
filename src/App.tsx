import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWallet, useWalletRecovery } from '@lightninglabs/wavelength-react';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { Backup } from './components/Backup';
import { Brand, NetworkBadge } from './components/Brand';
import { Dashboard, type DashboardView } from './components/Dashboard';
import { LanguageSwitch } from './components/LanguageSwitch';
import { Onboarding, Unlock } from './components/Onboarding';
import { RayitoMark } from './components/RayitoMark';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Progress } from './components/ui/progress';
import { useI18n } from './i18n/useI18n';
import type { MessageKey } from './i18n/messages';

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1_000;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'touchstart'] as const;
const LOADING_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  loading: 'app.loading.loading',
  runtimeReady: 'app.loading.runtimeReady',
  starting: 'app.loading.starting',
  syncing: 'app.loading.syncing',
  restoring: 'app.loading.restoring',
  stopping: 'app.loading.stopping',
  stopped: 'app.loading.stopped',
};

export function App() {
  const { t } = useI18n();
  const { phase, error, start, stop } = useWallet();
  const { recovery } = useWalletRecovery();
  const [pendingBackup, setPendingBackup] = useState<readonly string[] | null>(null);
  const [dashboardView, setDashboardView] = useState<DashboardView>('home');
  const lockPending = useRef(false);
  const isRecovering = recovery.status === 'restoring';
  const isDashboardVisible = phase === 'ready' && pendingBackup === null;

  const lockWallet = useCallback(async (): Promise<void> => {
    if (lockPending.current || phase !== 'ready' || isRecovering) return;

    lockPending.current = true;
    try {
      await stop();
      await start();
    } catch {
      // The wallet hook exposes lifecycle failures through phase and error.
    } finally {
      lockPending.current = false;
    }
  }, [isRecovering, phase, start, stop]);

  useEffect(() => {
    if (phase !== 'ready' || pendingBackup || isRecovering) return;

    let idleDeadline = Date.now() + AUTO_LOCK_DELAY_MS;
    let timer = 0;
    const scheduleLock = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void lockWallet(),
        Math.max(0, idleDeadline - Date.now()),
      );
    };
    const resetTimer = (): void => {
      idleDeadline = Date.now() + AUTO_LOCK_DELAY_MS;
      scheduleLock();
    };
    const checkIdleTimeWhenVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() >= idleDeadline) {
        window.clearTimeout(timer);
        void lockWallet();
        return;
      }
      scheduleLock();
    };

    scheduleLock();
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, resetTimer));
    window.addEventListener('scroll', resetTimer, true);
    document.addEventListener('visibilitychange', checkIdleTimeWhenVisible);
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      window.removeEventListener('scroll', resetTimer, true);
      document.removeEventListener('visibilitychange', checkIdleTimeWhenVisible);
    };
  }, [isRecovering, lockWallet, pendingBackup, phase]);

  useEffect(() => {
    if (!isRecovering) return;

    const guardRecovery = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = true;
    };

    window.addEventListener('beforeunload', guardRecovery);
    return () => window.removeEventListener('beforeunload', guardRecovery);
  }, [isRecovering]);

  let content: ReactNode;
  if (pendingBackup) {
    content = <Backup mnemonic={pendingBackup} onConfirmed={() => setPendingBackup(null)} />;
  } else {
    switch (phase) {
      case 'needsWallet':
        content = <Onboarding onCreated={setPendingBackup} />;
        break;
      case 'locked':
        content = <Unlock />;
        break;
      case 'ready':
        content = (
          <Dashboard
            view={dashboardView}
            onViewChange={setDashboardView}
          />
        );
        break;
      case 'error':
        content = <FatalError error={error ?? new Error(t('app.error.default'))} />;
        break;
      default:
        content = <Loading phase={phase} />;
    }
  }

  return (
    <div className={`app-shell wallet-frame${isDashboardVisible ? ' wallet-frame--dashboard' : ''}`}>
      <header className="app-header wallet-frame__header">
        <Brand onHome={() => setDashboardView('home')} />
        <div className="header-actions">
          <LanguageSwitch />
          <NetworkBadge />
          {phase === 'ready' && !pendingBackup && (
            <Button
              className="lock-button"
              type="button"
              variant="ghost"
              size="icon"
              disabled={isRecovering}
              onClick={() => void lockWallet()}
            >
              {isRecovering
                ? <LoaderCircle className="lock-button__spinner" aria-hidden="true" />
                : <LockKeyhole aria-hidden="true" />}
              <span className="sr-only">
                {isRecovering ? t('app.lock.recovering') : t('app.lock.lock')}
              </span>
            </Button>
          )}
        </div>
      </header>
      <div className={`wallet-frame__body${isDashboardVisible ? ' wallet-frame__body--dashboard' : ''}`}>
        {content}
      </div>
      {!isDashboardVisible && (
        <footer className="app-footer wallet-frame__footer">
          <p>
            {t('app.footer.poweredBy')}{' '}
            <a href="https://wavelength.lightning.engineering/" target="_blank" rel="noreferrer">
              Wavelength
            </a>{' '}
            {t('app.footer.custody')}
          </p>
          <p>{t('app.footer.alpha')}</p>
        </footer>
      )}
    </div>
  );
}

function Loading({ phase }: { phase: string }) {
  const { t } = useI18n();

  return (
    <main className="center-stage wallet-screen">
      <Card className="loader state-card loading-card" role="status" aria-live="polite">
        <span className="state-card__icon"><RayitoMark tone="monochrome" /></span>
        <p>{t(LOADING_LABEL_KEYS[phase] ?? 'app.loading.fallback')}</p>
        <Progress className="loading-progress" value={33} aria-hidden="true" />
        <small>{t('app.loading.keysNote')}</small>
      </Card>
    </main>
  );
}

type KnownErrorCode =
  | 'worker_error'
  | 'wallet_locked'
  | 'runtime_lock_unavailable'
  | 'asset_load_failed'
  | 'asset_integrity_failed';

const KNOWN_ERROR_KEYS: Readonly<Record<KnownErrorCode, { message: MessageKey; hint: MessageKey }>> = {
  worker_error: { message: 'app.error.worker', hint: 'app.error.workerHint' },
  wallet_locked: { message: 'app.error.walletLocked', hint: 'app.error.walletLockedHint' },
  runtime_lock_unavailable: { message: 'app.error.lockUnavailable', hint: 'app.error.lockUnavailableHint' },
  asset_load_failed: { message: 'app.error.assetLoad', hint: 'app.error.assetLoadHint' },
  asset_integrity_failed: { message: 'app.error.integrity', hint: 'app.error.integrityHint' },
};

function knownErrorCode(error: Error): KnownErrorCode | null {
  if (!('code' in error) || typeof error.code !== 'string') return null;
  return Object.hasOwn(KNOWN_ERROR_KEYS, error.code) ? error.code as KnownErrorCode : null;
}

function FatalError({ error }: { error: Error }) {
  const { t } = useI18n();
  const code = knownErrorCode(error);
  const keys = code ? KNOWN_ERROR_KEYS[code] : null;
  const retry = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('retry', Date.now().toString());
    window.location.replace(url);
  };

  return (
    <main className="center-stage wallet-screen">
      <Card
        className="unlock-card state-card fatal-error-card"
        role="region"
        aria-labelledby="fatal-error-title"
      >
        <p className="eyebrow">{t('app.error.eyebrow')}</p>
        <h1 id="fatal-error-title">{t('app.error.title')}</h1>
        <Alert className="form-error fatal-error-alert" variant="destructive">
          <AlertDescription>
            {keys ? t(keys.message) : error.message}
          </AlertDescription>
        </Alert>
        {keys && (
          <>
            <p>{t(keys.hint)}</p>
            <p><small>{t('app.error.technicalDetail', { message: error.message })}</small></p>
            {code === 'worker_error' && <p>{t('app.error.profileWarning')}</p>}
          </>
        )}
        <Button className="primary-button state-card__action" type="button" size="lg" onClick={retry}>
          {t('app.error.retry')}
        </Button>
      </Card>
    </main>
  );
}
