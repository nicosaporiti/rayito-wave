import { useI18n } from '../i18n/useI18n';
import type { MessageKey } from '../i18n/messages';
import { requestWalletReset } from '../lib/wallet-reset';
import { Brand } from './Brand';
import { LanguageSwitch } from './LanguageSwitch';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';

export type WalletResetFailureOutcome = 'blocked' | 'untouched' | 'partial';

type WalletResetFailureProps = {
  readonly outcome: WalletResetFailureOutcome;
};

const FAILURE_KEYS: Readonly<Record<WalletResetFailureOutcome, MessageKey>> = {
  blocked: 'reset.failure.blocked',
  untouched: 'reset.failure.untouched',
  partial: 'reset.failure.partial',
};

/**
 * Shown instead of the app when a requested wallet deletion could not finish.
 * The wallet engine is never created here, so this tab reopens no files. The
 * confirmation was consumed by this load, so a plain reload never deletes
 * anything unless a partial wipe is already underway.
 */
export function WalletResetFailure({ outcome }: WalletResetFailureProps) {
  const { t } = useI18n();
  const nothingDeleted = outcome !== 'partial';
  const reload = (): void => window.location.reload();
  const retry = (): void => {
    if (nothingDeleted) {
      try {
        requestWalletReset();
      } catch {
        // The reload below shows the wallet again; the user can retry from there.
      }
    }
    reload();
  };

  return (
    <div className="app-shell wallet-frame">
      <header className="app-header wallet-frame__header">
        <Brand onHome={reload} />
        <div className="header-actions">
          <LanguageSwitch />
        </div>
      </header>
      <div className="wallet-frame__body">
        <main className="center-stage wallet-screen">
          <Card
            className="unlock-card state-card fatal-error-card"
            role="region"
            aria-labelledby="reset-failure-title"
          >
            <p className="eyebrow">{t('reset.failure.eyebrow')}</p>
            <h1 id="reset-failure-title">{t('reset.failure.title')}</h1>
            <Alert className="form-error fatal-error-alert" variant="destructive">
              <AlertDescription>{t(FAILURE_KEYS[outcome])}</AlertDescription>
            </Alert>
            <p>{t('reset.failure.hint')}</p>
            <Button className="primary-button state-card__action" type="button" size="lg" onClick={retry}>
              {t('reset.failure.retry')}
            </Button>
            {nothingDeleted && (
              <Button className="text-button" type="button" variant="ghost" onClick={reload}>
                {t('reset.failure.keep')}
              </Button>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
