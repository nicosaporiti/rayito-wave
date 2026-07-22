import { useState } from 'react';
import { useWallet } from '@lightninglabs/wavelength-react';
import { Backup } from './components/Backup';
import { Brand, NetworkBadge } from './components/Brand';
import { Dashboard } from './components/Dashboard';
import { Onboarding, Unlock } from './components/Onboarding';
import { BoltIcon } from './components/Icons';

export function App() {
  const { phase, error } = useWallet();
  const [pendingBackup, setPendingBackup] = useState<readonly string[] | null>(null);

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
        content = <FatalError message={error?.message ?? 'No pudimos iniciar la wallet.'} />;
        break;
      default:
        content = <Loading phase={phase} />;
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header"><Brand /><NetworkBadge /></header>
      {content}
      <footer><p>Impulsado por <a href="https://wavelength.lightning.engineering/" target="_blank" rel="noreferrer">Wavelength</a> · autocustodia sobre Ark + Lightning</p><p>Alpha · usá sólo sats de prueba</p></footer>
    </div>
  );
}

function Loading({ phase }: { phase: string }) {
  const labels: Record<string, string> = { loading: 'Cargando el motor seguro…', runtimeReady: 'Preparando la red…', starting: 'Conectando con Signet…', syncing: 'Sincronizando tu wallet…', restoring: 'Recuperando tu wallet…', stopping: 'Cerrando…', stopped: 'Wallet detenida' };
  return <main className="center-stage"><div className="loader"><span><BoltIcon /></span><p>{labels[phase] ?? 'Preparando…'}</p><small>Las llaves nunca salen de este dispositivo</small></div></main>;
}

function FatalError({ message }: { message: string }) {
  return <main className="center-stage"><section className="unlock-card"><p className="eyebrow">Algo no arrancó bien</p><h1>No pudimos abrir Rayito</h1><p className="form-error">{message}</p><button className="primary-button" onClick={() => window.location.reload()}>Reintentar</button></section></main>;
}
