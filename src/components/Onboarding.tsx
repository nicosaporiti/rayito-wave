import { useState, type FormEvent } from 'react';
import {
  useWalletCreate,
  useWalletRestore,
  useWalletUnlock,
} from '@lightninglabs/wavelength-react';
import { normalizeMnemonic, validatePassword } from '../lib/validation';
import { ArrowUpIcon, BoltIcon } from './Icons';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

type OnboardingProps = {
  onCreated: (mnemonic: readonly string[]) => void;
};

type SetupMode = 'create' | 'restore';
const RECOVERY_WINDOW = 100;

export function Onboarding({ onCreated }: OnboardingProps) {
  const [mode, setMode] = useState<SetupMode>('create');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const { create, createPending, createError, resetCreate } = useWalletCreate();
  const { restore, restorePending, restoreError, resetRestore } = useWalletRestore();

  const changeMode = (nextMode: string): void => {
    if (nextMode !== 'create' && nextMode !== 'restore') return;

    setMode(nextMode);
    setValidation(null);
    resetCreate();
    resetRestore();
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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
      await restore({
        password,
        mnemonic: [...words],
        recoverState: true,
        recoveryWindow: RECOVERY_WINDOW,
      });
    } catch {
      // The Wavelength hooks expose the actionable error in their error state.
    }
  };

  const pending = createPending || restorePending;
  const sdkError = createError ?? restoreError;
  const formError = validation ?? sdkError?.message;

  return (
    <main className="onboarding onboarding-screen wallet-screen">
      <section className="onboarding-story onboarding-intro" aria-labelledby="onboarding-title">
        <p className="eyebrow">Bitcoin sencillo. Control real.</p>
        <h1 id="onboarding-title">Tu plata.<br /><em>En tus manos.</em></h1>
        <p className="story-copy">Una wallet para usar Bitcoin y Lightning sin entregar tus llaves. Rayito corre en este dispositivo; Wavelength conecta los rieles por debajo.</p>
        <div className="custody-note">
          <span className="custody-icon"><BoltIcon /></span>
          <div><strong>Autocustodia, de verdad</strong><p>La frase de recuperación se genera y cifra localmente. Ni Rayito ni Wavelength pueden verla.</p></div>
        </div>
      </section>

      <Card
        className="setup-card onboarding-form-card"
        role="region"
        aria-labelledby="setup-title"
      >
        <Tabs className="setup-tabs" value={mode} onValueChange={changeMode}>
          <TabsList className="mode-tabs" aria-label="Configurar wallet">
            <TabsTrigger
              value="create"
              onClick={() => {
                if (mode !== 'create') changeMode('create');
              }}
            >
              Nueva wallet
            </TabsTrigger>
            <TabsTrigger
              value="restore"
              onClick={() => {
                if (mode !== 'restore') changeMode('restore');
              }}
            >
              Recuperar
            </TabsTrigger>
          </TabsList>
          <TabsContent className="setup-body" value={mode}>
            <span className="step-label">{mode === 'create' ? '01 — Empezar' : '01 — Volver'}</span>
            <h2 id="setup-title">{mode === 'create' ? 'Abrí tu wallet' : 'Recuperá tu wallet'}</h2>
            <p>{mode === 'create' ? 'Elegí una contraseña local. Después vas a guardar tus 24 palabras.' : 'Ingresá tus 24 palabras y elegí una contraseña nueva para este dispositivo.'}</p>

            <form onSubmit={(event) => void submit(event)} noValidate>
              {mode === 'restore' && (
                <label className="field">
                  <span>Frase de recuperación</span>
                  <Textarea
                    value={mnemonic}
                    onChange={(event) => setMnemonic(event.target.value)}
                    rows={4}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="palabra 1  palabra 2  palabra 3…"
                    aria-invalid={Boolean(formError)}
                  />
                  <small>{mnemonic.trim() ? `${mnemonic.trim().split(/\s+/).length} / 24 palabras` : 'Separá cada palabra con un espacio.'}</small>
                </label>
              )}
              <label className="field">
                <span>Contraseña</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 10 caracteres"
                  aria-invalid={Boolean(formError)}
                />
              </label>
              <label className="field">
                <span>Repetir contraseña</span>
                <Input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Volvé a escribirla"
                  aria-invalid={Boolean(formError)}
                />
              </label>
              {formError && (
                <Alert className="form-error setup-error" variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Button
                className="primary-button setup-submit"
                type="submit"
                size="lg"
                disabled={pending}
              >
                {pending ? 'Preparando…' : mode === 'create' ? 'Crear mi wallet' : 'Recuperar wallet'}
                {!pending && <ArrowUpIcon />}
              </Button>
            </form>
            <p className="local-note"><span aria-hidden="true">●</span> Todo queda cifrado en este dispositivo</p>
          </TabsContent>
        </Tabs>
      </Card>
    </main>
  );
}

export function Unlock() {
  const [password, setPassword] = useState('');
  const { unlock, unlockPending, unlockError } = useWalletUnlock();

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      await unlock({ password });
    } catch {
      // useWalletUnlock publishes the error for the form below.
    }
  };

  return (
    <main className="center-stage wallet-screen">
      <Card
        className="unlock-card state-card unlock-wallet-card"
        role="region"
        aria-labelledby="unlock-title"
      >
        <span className="round-bolt state-card__icon"><BoltIcon /></span>
        <p className="eyebrow">Qué bueno verte de nuevo</p>
        <h1 id="unlock-title">Desbloqueá tu wallet</h1>
        <p>Tu wallet cifrada vive en este navegador.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Contraseña</span>
            <Input
              autoFocus
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(unlockError)}
            />
          </label>
          {unlockError && (
            <Alert className="form-error unlock-error" variant="destructive">
              <AlertDescription>{unlockError.message}</AlertDescription>
            </Alert>
          )}
          <Button
            className="primary-button unlock-submit"
            type="submit"
            size="lg"
            disabled={!password || unlockPending}
          >
            {unlockPending ? 'Abriendo…' : 'Abrir wallet'} <ArrowUpIcon />
          </Button>
        </form>
      </Card>
    </main>
  );
}
