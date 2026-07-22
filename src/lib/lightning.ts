const LIGHTNING_SCHEME = 'LIGHTNING:';

export function lightningInvoiceQrValue(invoice: string): string {
  const normalizedInvoice = invoice.trim().toUpperCase();
  return normalizedInvoice.startsWith(LIGHTNING_SCHEME)
    ? normalizedInvoice
    : `${LIGHTNING_SCHEME}${normalizedInvoice}`;
}
