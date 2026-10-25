import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useWallet,
  useWalletCreate,
  useWalletRestore,
  useWalletUnlock,
} from '@lightninglabs/wavelength-react';
import { useI18n } from '../i18n/useI18n';
import type { PendingMessage } from '../i18n/context';
import { normalizeMnemonic, validatePassword } from '../lib/validation';
import { requestWalletReset } from '../lib/wallet-reset';
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
  /** Shown once after the previous wallet was deleted from this device. */
  walletResetDone?: boolean;
};

type SetupMode = 'create' | 'restore';
const RECOVERY_WINDOW = 100;

export function Onboarding({ onCreated, walletResetDone = false }: OnboardingProps) {
  const { resolve, t } = useI18n();
  // Live regions announce changes, not content present on load, so the notice
  // is filled in after the first render.
  const [resetNoticeVisible, setResetNoticeVisible] = useState(false);
  useEffect(() => {
    if (!walletResetDone) return undefined;
    const timer = window.setTimeout(() => setResetNoticeVisible(true), 0);
    return () => window.clearTimeout(timer);
  }, [walletResetDone]);
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
        {walletResetDone && (
          <div role="status">
            {resetNoticeVisible && (
              <Alert className="reset-done" role="none">
                <AlertDescription>{t('reset.done')}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
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
  const [forgotOpen, setForgotOpen] = useState(false);
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
        {forgotOpen ? <ForgotPassword onCancel={() => setForgotOpen(false)} /> : (
          <>
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
            <Button
              className="text-button unlock-forgot"
              type="button"
              variant="ghost"
              disabled={unlockPending}
              onClick={() => setForgotOpen(true)}
            >
              {t('unlock.forgot')}
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}

// A daemon that never acknowledges the stop must not leave the user stuck.
const STOP_TIMEOUT_MS = 5_000;

const RESET_WARNING_KEYS = [
  'reset.warning.data',
  'reset.warning.words',
  'reset.warning.pending',
  'reset.warning.device',
  'reset.warning.tabs',
] as const;

function ForgotPassword({ onCancel }: { readonly onCancel: () => void }) {
  const { t } = useI18n();
  const { stop } = useWallet();
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The button that opened this view is gone, so hand focus to its heading.
  useEffect(() => headingRef.current?.focus(), []);

  const confirm = async (): Promise<void> => {
    try {
      requestWalletReset();
    } catch {
      setStorageBlocked(true);
      return;
    }

    setPending(true);
    try {
      // Stopping hands the runtime lock back so the reloaded page can take it
      // right away; the wipe retries files the closing runtime still holds.
      await Promise.race([
        stop(),
        new Promise((resolve) => window.setTimeout(resolve, STOP_TIMEOUT_MS)),
      ]);
    } catch {
      // The reload tears the runtime down regardless.
    }
    window.location.reload();
  };

  return (
    <>
      <p className="eyebrow">{t('reset.eyebrow')}</p>
      <h1 id="unlock-title" ref={headingRef} tabIndex={-1}>{t('reset.title')}</h1>
      <p>{t('reset.intro')}</p>
      <ul className="reset-warnings">
        {RESET_WARNING_KEYS.map((key) => <li key={key}>{t(key)}</li>)}
      </ul>
      <label className="reset-confirm">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>{t('reset.confirm')}</span>
      </label>
      {storageBlocked && (
        <Alert className="form-error reset-error" variant="destructive">
          <AlertDescription>{t('reset.error.storage')}</AlertDescription>
        </Alert>
      )}
      <div className="reset-actions">
        <Button
          className="reset-submit"
          type="button"
          variant="destructive"
          size="lg"
          disabled={!acknowledged || pending}
          onClick={() => void confirm()}
        >
          {t(pending ? 'reset.submit.pending' : 'reset.submit')}
        </Button>
        <Button
          className="text-button"
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          {t('reset.cancel')}
        </Button>
      </div>
    </>
  );
}
