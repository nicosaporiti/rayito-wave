import type { ReactElement } from 'react';
import { useI18n } from '../i18n/useI18n';
import { activeNetworkProfile } from '../lib/network';
import { LinkIcon } from './Icons';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

type FaucetGuideProps = {
  readonly address: string;
};

const FAUCET_STEPS = [
  { strong: 'faucet.step1.strong', rest: 'faucet.step1.rest' },
  { strong: 'faucet.step2.strong', rest: 'faucet.step2.rest' },
  { strong: 'faucet.step3.strong', rest: 'faucet.step3.rest' },
  { strong: 'faucet.step4.strong', rest: 'faucet.step4.rest' },
] as const;

export function FaucetGuide({ address }: FaucetGuideProps): ReactElement {
  const { t } = useI18n();
  const { explorerUrl, faucetUrl } = activeNetworkProfile();
  const mempoolAddressUrl = `${explorerUrl}/address/${encodeURIComponent(address)}`;

  return (
    <section className="faucet-guide" aria-labelledby="faucet-guide-title">
      <p className="faucet-guide-kicker">{t('faucet.kicker')}</p>
      <h3 id="faucet-guide-title">{t('faucet.title')}</h3>
      <ol>
        {FAUCET_STEPS.map((step, index) => (
          <li key={step.strong}>
            <span aria-hidden="true">{index + 1}</span>
            <p><strong>{t(step.strong)}</strong>{t(step.rest)}</p>
          </li>
        ))}
      </ol>
      <Separator className="faucet-guide-separator" />
      <div className="faucet-guide-actions">
        <Button className="faucet-link" asChild>
          <a
            href={faucetUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('faucet.open.aria')}
          >
            {t('faucet.open')}
            <LinkIcon />
          </a>
        </Button>
        <Button className="faucet-mempool-link" variant="outline" asChild>
          <a
            href={mempoolAddressUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('faucet.track.aria')}
          >
            {t('faucet.track')}
            <LinkIcon />
          </a>
        </Button>
      </div>
      <Alert className="faucet-guide-note" role="note">
        <AlertDescription>{t('faucet.note')}</AlertDescription>
      </Alert>
    </section>
  );
}
