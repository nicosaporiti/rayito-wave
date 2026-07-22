import { describe, expect, it } from 'vitest';
import { lightningInvoiceQrValue } from './lightning';

describe('lightningInvoiceQrValue', () => {
  it('creates an uppercase Lightning URI for compact QR encoding', () => {
    expect(lightningInvoiceQrValue('lntbs10u1example')).toBe('LIGHTNING:LNTBS10U1EXAMPLE');
  });

  it('normalizes an existing Lightning URI without duplicating its scheme', () => {
    expect(lightningInvoiceQrValue(' lightning:LNTBS10U1example '))
      .toBe('LIGHTNING:LNTBS10U1EXAMPLE');
  });
});
