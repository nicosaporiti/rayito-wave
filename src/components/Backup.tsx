import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/useI18n';
import type { MessageKey } from '../i18n/messages';
import { useHoldNetwork } from '../lib/network';
import { ArrowUpIcon } from './Icons';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';

type BackupProps = {
  mnemonic: readonly string[];
  onConfirmed: () => void;
};

const CHECK_INDEXES = [3, 11, 23] as const;

export function Backup({ mnemonic, onConfirmed }: BackupProps) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  useHoldNetwork(true);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const confirm = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const valid = CHECK_INDEXES.every((index) => answers[index]?.trim().toLowerCase() === mnemonic[index]?.toLowerCase());
    if (!valid) return setErrorKey('backup.check.error');
    onConfirmed();
  };

  return (
    <main className="backup-stage backup-screen wallet-screen">
      <Card
        className="backup-card recovery-card"
        role="region"
        aria-labelledby="backup-title"
      >
        <div className="backup-heading">
          <div>
            <span className="step-label">{t('backup.step')}</span>
            <h1 id="backup-title">{t('backup.title')}</h1>
          </div>
          <span className="backup-count">24</span>
        </div>
        <Alert className="warning-strip backup-warning">
          <AlertTitle>{t('backup.warning.title')}</AlertTitle>
          <AlertDescription>{t('backup.warning.copy')}</AlertDescription>
        </Alert>
        <ol className="words-grid">
          {mnemonic.map((word, index) => (
            <li key={`${word}-${index}`}>
              <span>{index + 1}</span>
              {word}
            </li>
          ))}
        </ol>

        <form className="backup-check" onSubmit={confirm}>
          <h2>{t('backup.check.title')}</h2>
          <p>{t('backup.check.copy')}</p>
          <div className="check-fields">
            {CHECK_INDEXES.map((index) => (
              <label className="field" key={index}>
                <span>{t('backup.check.word', { position: index + 1 })}</span>
                <Input
                  value={answers[index] ?? ''}
                  onChange={(event) => setAnswers((current) => ({
                    ...current,
                    [index]: event.target.value,
                  }))}
                  autoComplete="off"
                  aria-invalid={Boolean(errorKey)}
                />
              </label>
            ))}
          </div>
          {errorKey && (
            <Alert className="form-error backup-error" variant="destructive">
              <AlertDescription>{t(errorKey)}</AlertDescription>
            </Alert>
          )}
          <Button className="primary-button backup-submit" type="submit" size="lg">
            {t('backup.submit')} <ArrowUpIcon />
          </Button>
        </form>
      </Card>
    </main>
  );
}
