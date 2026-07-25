import type { ReactElement } from 'react';
import { useI18n } from '../i18n/useI18n';
import { LinkIcon } from './Icons';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

const SIGNET_FAUCET_URL = 'https://bitcoinsignetfaucet.com/';
const SIGNET_MEMPOOL_ADDRESS_URL = 'https://mempool.space/signet/address/';

type SignetFaucetGuideProps = {
  readonly address: string;
};

const FAUCET_STEPS = [
  { strong: 'faucet.step1.strong', rest: 'faucet.step1.rest' },
  { strong: 'faucet.step2.strong', rest: 'faucet.step2.rest' },
  { strong: 'faucet.step3.strong', rest: 'faucet.step3.rest' },
  { strong: 'faucet.step4.strong', rest: 'faucet.step4.rest' },
] as const;

export function SignetFaucetGuide({ address }: SignetFaucetGuideProps): ReactElement {
  const { t } = useI18n();
  const mempoolAddressUrl = `${SIGNET_MEMPOOL_ADDRESS_URL}${encodeURIComponent(address)}`;

  return (
    <section className="signet-guide" aria-labelledby="signet-guide-title">
      <p className="signet-guide-kicker">{t('faucet.kicker')}</p>
      <h3 id="signet-guide-title">{t('faucet.title')}</h3>
      <ol>
        {FAUCET_STEPS.map((step, index) => (
          <li key={step.strong}>
            <span aria-hidden="true">{index + 1}</span>
            <p><strong>{t(step.strong)}</strong>{t(step.rest)}</p>
          </li>
        ))}
      </ol>
      <Separator className="signet-guide-separator" />
      <div className="signet-guide-actions">
        <Button className="signet-faucet-link" asChild>
          <a
            href={SIGNET_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('faucet.open.aria')}
          >
            {t('faucet.open')}
            <LinkIcon />
          </a>
        </Button>
        <Button className="signet-mempool-link" variant="outline" asChild>
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
      <Alert className="signet-guide-note" role="note">
        <AlertDescription>{t('faucet.note')}</AlertDescription>
      </Alert>
    </section>
  );
}
