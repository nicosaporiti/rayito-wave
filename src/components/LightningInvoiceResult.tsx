import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatSats } from '../lib/format';
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
        <AlertTitle>Factura lista</AlertTitle>
        <AlertDescription>Esperando {formatSats(amountSat)} sats</AlertDescription>
      </Alert>
      <figure className="invoice-qr">
        <QRCodeSVG
          value={lightningInvoiceQrValue(invoice)}
          size={300}
          level="M"
          marginSize={4}
          title="QR de la factura Lightning"
          role="img"
          aria-label="QR para pagar la factura Lightning"
        />
        <figcaption>Escaneá con otra wallet Lightning</figcaption>
      </figure>
      <Separator className="invoice-separator" />
      <div className="invoice-copy">
        <code title={invoice}>{invoice}</code>
        <Button type="button" variant="outline" onClick={() => void copy()}>
          <CopyIcon /> {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="invoice-hint">Se cerrará automáticamente al confirmar el pago.</p>
    </div>
  );
}
