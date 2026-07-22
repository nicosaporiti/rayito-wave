import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet, useWalletRecovery } from '@lightninglabs/wavelength-react';
import { Backup } from './components/Backup';
import { Brand, NetworkBadge } from './components/Brand';
import { Dashboard } from './components/Dashboard';
import { Onboarding, Unlock } from './components/Onboarding';
import { BoltIcon } from './components/Icons';
import { clearBrowserWalletData } from './lib/browser-storage';
import { walletEngine } from './lib/wavelength';

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1_000;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'scroll'] as const;

export function App() {
  const { phase, error, start, stop } = useWallet();
  const { recovery } = useWalletRecovery();
  const [pendingBackup, setPendingBackup] = useState<readonly string[] | null>(null);
  const lockPending = useRef(false);
  const isRecovering = recovery.status === 'restoring';

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
    if (document.visibilityState === 'hidden') {
      void lockWallet();
      return;
    }

    let timer = window.setTimeout(() => void lockWallet(), AUTO_LOCK_DELAY_MS);
    const resetTimer = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void lockWallet(), AUTO_LOCK_DELAY_MS);
    };
    const lockWhenHidden = (): void => {
      if (document.visibilityState === 'hidden') void lockWallet();
    };

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, resetTimer));
    document.addEventListener('visibilitychange', lockWhenHidden);
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      document.removeEventListener('visibilitychange', lockWhenHidden);
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

  let content;
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
    <div className="app-shell">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          <NetworkBadge />
          {phase === 'ready' && !pendingBackup && (
            <button
              className="lock-button"
              type="button"
              disabled={isRecovering}
              onClick={() => void lockWallet()}
            >
              {isRecovering ? 'Recuperando…' : 'Bloquear'}
            </button>
          )}
        </div>
      </header>
      {content}
      <footer><p>Impulsado por <a href="https://wavelength.lightning.engineering/" target="_blank" rel="noreferrer">Wavelength</a> · autocustodia sobre Ark + Lightning</p><p>Alpha · usá sólo sats de prueba</p></footer>
    </div>
  );
}

function Loading({ phase }: { phase: string }) {
  const labels: Record<string, string> = { loading: 'Cargando el motor seguro…', runtimeReady: 'Preparando la red…', starting: 'Conectando con Signet…', syncing: 'Sincronizando tu wallet…', restoring: 'Recuperando tu wallet…', stopping: 'Cerrando…', stopped: 'Wallet detenida' };
  return <main className="center-stage"><div className="loader"><span><BoltIcon /></span><p>{labels[phase] ?? 'Preparando…'}</p><small>Las llaves nunca salen de este dispositivo</small></div></main>;
}

function isWorkerError(error: Error): error is Error & { readonly code: 'worker_error' } {
  return 'code' in error && error.code === 'worker_error';
}

function FatalError({ error }: { error: Error }) {
  const workerFailed = isWorkerError(error);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const retry = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('retry', Date.now().toString());
    window.location.replace(url);
  };
  const resetLocalData = async (): Promise<void> => {
    setIsResetting(true);
    setResetError(null);
    walletEngine.dispose();

    try {
      await clearBrowserWalletData();
      retry();
    } catch (resetFailure) {
      setResetError(
        resetFailure instanceof Error
          ? resetFailure.message
          : 'Chrome no permitió borrar los datos locales.',
      );
      setIsResetting(false);
    }
  };

  return (
    <main className="center-stage">
      <section className="unlock-card">
        <p className="eyebrow">Algo no arrancó bien</p>
        <h1>No pudimos abrir Rayito</h1>
        <p className="form-error">
          {workerFailed
            ? 'No pudimos iniciar uno de los procesos locales de Rayito.'
            : error.message}
        </p>
        {workerFailed && (
          <>
            <p>Puede deberse a un bloqueo del navegador o a que el motor se detuvo inesperadamente.</p>
            <p><small>Detalle técnico: {error.message}</small></p>
            <p>
              Si probás otro perfil o navegador, la wallet no aparecerá automáticamente: necesitás tus 24 palabras para recuperarla. No borres los datos del perfil original.
            </p>
            <p><small>Si esta wallet es de prueba y podés perderla, restablecé el almacenamiento interno de Chrome:</small></p>
            <button
              className="reset-button"
              type="button"
              disabled={isResetting}
              onClick={() => void resetLocalData()}
            >
              {isResetting ? 'Borrando datos…' : 'Borrar datos locales y reintentar'}
            </button>
            {resetError && <p className="form-error">{resetError}</p>}
          </>
        )}
        <button className="primary-button" onClick={retry}>Reintentar</button>
      </section>
    </main>
  );
}
