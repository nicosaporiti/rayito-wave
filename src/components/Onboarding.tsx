import { useState, type FormEvent } from 'react';
import {
  useWalletCreate,
  useWalletRestore,
  useWalletUnlock,
} from '@lightninglabs/wavelength-react';
import { normalizeMnemonic, validatePassword } from '../lib/validation';
import { ArrowUpIcon, BoltIcon } from './Icons';

type OnboardingProps = {
  onCreated: (mnemonic: readonly string[]) => void;
};

type SetupMode = 'create' | 'restore';

export function Onboarding({ onCreated }: OnboardingProps) {
  const [mode, setMode] = useState<SetupMode>('create');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const { create, createPending, createError, resetCreate } = useWalletCreate();
  const { restore, restorePending, restoreError, resetRestore } = useWalletRestore();

  const changeMode = (nextMode: SetupMode) => {
    setMode(nextMode);
    setValidation(null);
    resetCreate();
    resetRestore();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issue = validatePassword(password);
    if (issue) return setValidation(issue);
    if (password !== confirmation) return setValidation('Las contraseñas no coinciden.');

    setValidation(null);
    try {
      if (mode === 'create') {
        const result = await create({ password });
        onCreated(result.mnemonic);
        return;
      }

      const words = normalizeMnemonic(mnemonic);
      if (words.length !== 24) return setValidation(`La frase debe tener 24 palabras; encontramos ${words.length}.`);
      await restore({ password, mnemonic: [...words], recoverState: true });
    } catch {
      // The Wavelength hooks expose the actionable error in their error state.
    }
  };

  const pending = createPending || restorePending;
  const sdkError = createError ?? restoreError;

  return (
    <main className="onboarding">
      <section className="onboarding-story">
        <p className="eyebrow">Bitcoin sencillo. Control real.</p>
        <h1>Tu plata.<br /><em>En tus manos.</em></h1>
        <p className="story-copy">Una wallet para usar Bitcoin y Lightning sin entregar tus llaves. Rayito corre en este dispositivo; Wavelength conecta los rieles por debajo.</p>
        <div className="custody-note">
          <span className="custody-icon"><BoltIcon /></span>
          <div><strong>Autocustodia, de verdad</strong><p>La frase de recuperación se genera y cifra localmente. Ni Rayito ni Wavelength pueden verla.</p></div>
        </div>
      </section>

      <section className="setup-card" aria-labelledby="setup-title">
        <div className="mode-tabs" role="tablist" aria-label="Configurar wallet">
          <button role="tab" aria-selected={mode === 'create'} onClick={() => changeMode('create')}>Nueva wallet</button>
          <button role="tab" aria-selected={mode === 'restore'} onClick={() => changeMode('restore')}>Recuperar</button>
        </div>
        <div className="setup-body">
          <span className="step-label">{mode === 'create' ? '01 — Empezar' : '01 — Volver'}</span>
          <h2 id="setup-title">{mode === 'create' ? 'Abrí tu wallet' : 'Recuperá tu wallet'}</h2>
          <p>{mode === 'create' ? 'Elegí una contraseña local. Después vas a guardar tus 24 palabras.' : 'Ingresá tus 24 palabras y elegí una contraseña nueva para este dispositivo.'}</p>

          <form onSubmit={(event) => void submit(event)} noValidate>
            {mode === 'restore' && (
              <label className="field">
                <span>Frase de recuperación</span>
                <textarea value={mnemonic} onChange={(event) => setMnemonic(event.target.value)} rows={4} autoComplete="off" spellCheck={false} placeholder="palabra 1  palabra 2  palabra 3…" />
                <small>{mnemonic.trim() ? `${mnemonic.trim().split(/\s+/).length} / 24 palabras` : 'Separá cada palabra con un espacio.'}</small>
              </label>
            )}
            <label className="field">
              <span>Contraseña</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Mínimo 10 caracteres" />
            </label>
            <label className="field">
              <span>Repetir contraseña</span>
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" placeholder="Volvé a escribirla" />
            </label>
            {(validation || sdkError) && <p className="form-error" role="alert">{validation ?? sdkError?.message}</p>}
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? 'Preparando…' : mode === 'create' ? 'Crear mi wallet' : 'Recuperar wallet'}
              {!pending && <ArrowUpIcon />}
            </button>
          </form>
          <p className="local-note"><span>●</span> Todo queda cifrado en este dispositivo</p>
        </div>
      </section>
    </main>
  );
}

export function Unlock() {
  const [password, setPassword] = useState('');
  const { unlock, unlockPending, unlockError } = useWalletUnlock();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await unlock({ password });
    } catch {
      // useWalletUnlock publishes the error for the form below.
    }
  };

  return (
    <main className="center-stage">
      <section className="unlock-card">
        <span className="round-bolt"><BoltIcon /></span>
        <p className="eyebrow">Qué bueno verte de nuevo</p>
        <h1>Desbloqueá tu wallet</h1>
        <p>Tu wallet cifrada vive en este navegador.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Contraseña</span><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {unlockError && <p className="form-error" role="alert">{unlockError.message}</p>}
          <button className="primary-button" disabled={!password || unlockPending}>{unlockPending ? 'Abriendo…' : 'Abrir wallet'} <ArrowUpIcon /></button>
        </form>
      </section>
    </main>
  );
}
