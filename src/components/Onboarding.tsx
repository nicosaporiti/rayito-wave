import { useState, type FormEvent } from 'react';
import {
  useWalletCreate,
  useWalletRestore,
  useWalletUnlock,
} from '@lightninglabs/wavelength-react';
import { useI18n } from '../i18n/useI18n';
import type { PendingMessage } from '../i18n/context';
import { normalizeMnemonic, validatePassword } from '../lib/validation';
import { ArrowUpIcon } from './Icons';
import { SecurityMark } from './SecurityMark';
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
  const { resolve, t } = useI18n();
  const [mode, setMode] = useState<SetupMode>('create');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [validation, setValidation] = useState<PendingMessage | null>(null);
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
    if (issue) return setValidation({ key: issue });
    if (password !== confirmation) {
      return setValidation({ key: 'onboarding.error.passwordMismatch' });
    }

    setValidation(null);
    try {
      if (mode === 'create') {
        const result = await create({ password });
        onCreated(result.mnemonic);
        return;
      }

      const words = normalizeMnemonic(mnemonic);
      if (words.length !== 24) {
        return setValidation({
          key: 'onboarding.error.wordCount',
          params: { count: words.length },
        });
      }
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
  const formError = validation ? resolve(validation) : sdkError?.message;

  return (
    <main className="onboarding onboarding-screen wallet-screen">
      <section className="onboarding-story onboarding-intro" aria-labelledby="onboarding-title">
        <p className="eyebrow">{t('onboarding.eyebrow')}</p>
        <h1 id="onboarding-title">
          {t('onboarding.title.line1')}<br /><em>{t('onboarding.title.line2')}</em>
        </h1>
        <p className="story-copy">{t('onboarding.story')}</p>
        <div className="custody-note">
          <span className="custody-icon"><SecurityMark /></span>
          <div>
            <strong>{t('onboarding.custody.title')}</strong>
            <p>{t('onboarding.custody.copy')}</p>
          </div>
        </div>
      </section>

      <Card
        className="setup-card onboarding-form-card"
        role="region"
        aria-labelledby="setup-title"
      >
        <Tabs className="setup-tabs" value={mode} onValueChange={changeMode}>
          <TabsList className="mode-tabs" aria-label={t('onboarding.tabs.aria')}>
            <TabsTrigger
              value="create"
              onClick={() => {
                if (mode !== 'create') changeMode('create');
              }}
            >
              {t('onboarding.tabs.create')}
            </TabsTrigger>
            <TabsTrigger
              value="restore"
              onClick={() => {
                if (mode !== 'restore') changeMode('restore');
              }}
            >
              {t('onboarding.tabs.restore')}
            </TabsTrigger>
          </TabsList>
          <TabsContent className="setup-body" value={mode}>
            <span className="step-label">
              {t(mode === 'create' ? 'onboarding.step.create' : 'onboarding.step.restore')}
            </span>
            <h2 id="setup-title">
              {t(mode === 'create' ? 'onboarding.heading.create' : 'onboarding.heading.restore')}
            </h2>
            <p>{t(mode === 'create' ? 'onboarding.copy.create' : 'onboarding.copy.restore')}</p>

            <form onSubmit={(event) => void submit(event)} noValidate>
              {mode === 'restore' && (
                <label className="field">
                  <span>{t('onboarding.field.mnemonic')}</span>
                  <Textarea
                    value={mnemonic}
                    onChange={(event) => setMnemonic(event.target.value)}
                    rows={4}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={t('onboarding.field.mnemonic.placeholder')}
                    aria-invalid={Boolean(formError)}
                  />
                  <small>
                    {mnemonic.trim()
                      ? t('onboarding.field.mnemonic.count', {
                          count: mnemonic.trim().split(/\s+/).length,
                        })
                      : t('onboarding.field.mnemonic.hint')}
                  </small>
                </label>
              )}
              <label className="field">
                <span>{t('onboarding.field.password')}</span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder={t('onboarding.field.password.placeholder')}
                  aria-invalid={Boolean(formError)}
                />
              </label>
              <label className="field">
                <span>{t('onboarding.field.confirmation')}</span>
                <Input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  placeholder={t('onboarding.field.confirmation.placeholder')}
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
                {pending
                  ? t('onboarding.submit.pending')
                  : t(mode === 'create' ? 'onboarding.submit.create' : 'onboarding.submit.restore')}
                {!pending && <ArrowUpIcon />}
              </Button>
            </form>
            <p className="local-note">
              <span aria-hidden="true">●</span> {t('onboarding.localNote')}
            </p>
          </TabsContent>
        </Tabs>
      </Card>
    </main>
  );
}

export function Unlock() {
  const { t } = useI18n();
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
        <span className="security-emblem state-card__icon">
          <SecurityMark />
        </span>
        <p className="eyebrow">{t('unlock.eyebrow')}</p>
        <h1 id="unlock-title">{t('unlock.title')}</h1>
        <p>{t('unlock.copy')}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>{t('unlock.field.password')}</span>
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
            {unlockPending ? t('unlock.submit.pending') : t('unlock.submit')} <ArrowUpIcon />
          </Button>
        </form>
      </Card>
    </main>
  );
}
