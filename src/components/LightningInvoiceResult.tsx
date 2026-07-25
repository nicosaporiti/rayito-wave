import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useI18n } from '../i18n/useI18n';
import { lightningInvoiceQrValue } from '../lib/lightning';
import { CopyIcon } from './Icons';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

type LightningInvoiceResultProps = {
  readonly amountSat: number;
  readonly invoice: string;
};

async function copyInvoice(invoice: string): Promise<void> {
  await navigator.clipboard.writeText(invoice);
}

export function LightningInvoiceResult({ amountSat, invoice }: LightningInvoiceResultProps) {
  const { formatSats, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    await copyInvoice(invoice);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <div className="invoice-result">
      <Alert className="invoice-status" role="status" aria-live="polite">
        <span className="invoice-status-dot" aria-hidden="true" />
        <AlertTitle>{t('invoice.ready.title')}</AlertTitle>
        <AlertDescription>
          {t('invoice.ready.detail', { sats: formatSats(amountSat) })}
        </AlertDescription>
      </Alert>
      <figure className="invoice-qr">
        <QRCodeSVG
          value={lightningInvoiceQrValue(invoice)}
          size={300}
          level="M"
          marginSize={4}
          title={t('invoice.qr.title')}
          role="img"
          aria-label={t('invoice.qr.aria')}
        />
        <figcaption>{t('invoice.qr.caption')}</figcaption>
      </figure>
      <Separator className="invoice-separator" />
      <div className="invoice-copy">
        <code title={invoice}>{invoice}</code>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          <CopyIcon /> {t(copied ? 'copy.copied' : 'copy.copy')}
        </Button>
      </div>
      <p className="invoice-hint">{t('invoice.hint')}</p>
    </div>
  );
}
