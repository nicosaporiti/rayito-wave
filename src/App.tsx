import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWallet, useWalletRecovery } from '@lightninglabs/wavelength-react';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { Backup } from './components/Backup';
import { Brand, NetworkBadge } from './components/Brand';
import { Dashboard } from './components/Dashboard';
import { Onboarding, Unlock } from './components/Onboarding';
import { BoltIcon } from './components/Icons';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Progress } from './components/ui/progress';

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1_000;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'touchstart'] as const;
const LOADING_LABELS: Readonly<Record<string, string>> = {
  loading: 'Cargando el motor seguro…',
  runtimeReady: 'Preparando la red…',
  starting: 'Conectando con Signet…',
  syncing: 'Sincronizando tu wallet…',
  restoring: 'Recuperando tu wallet…',
  stopping: 'Cerrando…',
  stopped: 'Wallet detenida',
};

export function App() {
  const { phase, error, start, stop } = useWallet();
  const { recovery } = useWalletRecovery();
  const [pendingBackup, setPendingBackup] = useState<readonly string[] | null>(null);
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
        content = <Dashboard />;
        break;
      case 'error':
        content = <FatalError error={error ?? new Error('No pudimos iniciar la wallet.')} />;
        break;
      default:
        content = <Loading phase={phase} />;
    }
  }

  return (
    <div className={`app-shell wallet-frame${isDashboardVisible ? ' wallet-frame--dashboard' : ''}`}>
      <header className="app-header wallet-frame__header">
        <Brand />
        <div className="header-actions">
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
              <span className="sr-only">{isRecovering ? 'Recuperando…' : 'Bloquear'}</span>
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
            Impulsado por{' '}
            <a href="https://wavelength.lightning.engineering/" target="_blank" rel="noreferrer">
              Wavelength
            </a>{' '}
            · autocustodia sobre Ark + Lightning
          </p>
          <p>Alpha · usá sólo sats de prueba</p>
        </footer>
      )}
    </div>
  );
}

function Loading({ phase }: { phase: string }) {
  return (
    <main className="center-stage wallet-screen">
      <Card className="loader state-card loading-card" role="status" aria-live="polite">
        <span className="state-card__icon"><BoltIcon /></span>
        <p>{LOADING_LABELS[phase] ?? 'Preparando…'}</p>
        <Progress className="loading-progress" value={33} aria-hidden="true" />
        <small>Las llaves nunca salen de este dispositivo</small>
      </Card>
    </main>
  );
}

function isWorkerError(error: Error): error is Error & { readonly code: 'worker_error' } {
  return 'code' in error && error.code === 'worker_error';
}

function FatalError({ error }: { error: Error }) {
  const workerFailed = isWorkerError(error);
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
        <p className="eyebrow">Algo no arrancó bien</p>
        <h1 id="fatal-error-title">No pudimos abrir Rayito</h1>
        <Alert className="form-error fatal-error-alert" variant="destructive">
          <AlertDescription>
            {workerFailed
              ? 'No pudimos iniciar uno de los procesos locales de Rayito.'
              : error.message}
          </AlertDescription>
        </Alert>
        {workerFailed && (
          <>
            <p>Puede deberse a un bloqueo del navegador o a que el motor se detuvo inesperadamente.</p>
            <p><small>Detalle técnico: {error.message}</small></p>
            <p>
              Si probás otro perfil o navegador, la wallet no aparecerá automáticamente: necesitás tus 24 palabras para recuperarla. No borres los datos del perfil original.
            </p>
          </>
        )}
        <Button className="primary-button state-card__action" type="button" size="lg" onClick={retry}>
          Reintentar
        </Button>
      </Card>
    </main>
  );
}
