import { describe, expect, it } from 'vitest';
import { VALID_BOLT11_INVOICE, VALID_LNURL } from '../test/fixtures';
import { parseScannedInvoice } from './scanned-invoice';

describe('parseScannedInvoice', () => {
  it.each([
    [VALID_BOLT11_INVOICE, VALID_BOLT11_INVOICE],
    [VALID_BOLT11_INVOICE.toUpperCase(), VALID_BOLT11_INVOICE.toUpperCase()],
    [`LIGHTNING:${VALID_BOLT11_INVOICE}`, VALID_BOLT11_INVOICE],
    [`lightning://${VALID_BOLT11_INVOICE}`, VALID_BOLT11_INVOICE],
    [
      `bitcoin:tb1qrayito?amount=0.00001&lightning=${VALID_BOLT11_INVOICE}`,
      VALID_BOLT11_INVOICE,
    ],
  ])('extracts a Lightning invoice from %s', (payload, invoice) => {
    expect(parseScannedInvoice(payload)).toEqual({ valid: true, invoice });
  });

  it.each([
    VALID_LNURL,
    'ln-not-an-invoice',
    'lntbs21u1rayito',
    `${VALID_BOLT11_INVOICE.slice(0, -1)}q`,
  ])('rejects a non-BOLT11 ln payload: %s', (payload) => {
    expect(parseScannedInvoice(payload)).toEqual({
      valid: false,
      error: 'Ese QR no contiene una factura Lightning.',
    });
  });

  it('rejects a QR without a Lightning invoice', () => {
    expect(parseScannedInvoice('bitcoin:tb1qrayito?amount=0.00001')).toEqual({
      valid: false,
      error: 'Ese QR no contiene una factura Lightning.',
    });
  });
});
