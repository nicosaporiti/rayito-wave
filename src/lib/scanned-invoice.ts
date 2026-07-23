import { decode } from 'light-bolt11-decoder';

export type ScannedInvoiceResult =
  | { readonly valid: true; readonly invoice: string }
  | { readonly valid: false; readonly error: string };

const LIGHTNING_URI_PREFIX = /^lightning:(?:\/\/)?/i;
const TIMESTAMP_SECTION_LENGTH = 7;
const PAYMENT_HASH_SECTION_LENGTH = 55;
const MINIMUM_DESCRIPTION_SECTION_LENGTH = 3;
const DESCRIPTION_HASH_SECTION_LENGTH = 55;
const SIGNATURE_SECTION_LENGTH = 104;
const CHECKSUM_SECTION_LENGTH = 6;

type Bolt11Section = {
  readonly name: string;
  readonly letters?: string;
};

function hasSingleSectionWithLength(
  sections: readonly Bolt11Section[],
  name: string,
  length: number,
): boolean {
  const matches = sections.filter((section) => section.name === name);
  return matches.length === 1 && matches[0]?.letters?.length === length;
}

function hasSingleDescription(sections: readonly Bolt11Section[]): boolean {
  const matches = sections.filter(
    ({ name }) => name === 'description' || name === 'description_hash',
  );
  if (matches.length !== 1) return false;

  const [description] = matches;
  if (description?.name === 'description_hash') {
    return description.letters?.length === DESCRIPTION_HASH_SECTION_LENGTH;
  }

  return (description?.letters?.length ?? 0) >= MINIMUM_DESCRIPTION_SECTION_LENGTH;
}

function isBolt11Invoice(value: string): boolean {
  try {
    const sections: readonly Bolt11Section[] = decode(value).sections;
    return (
      hasSingleSectionWithLength(
        sections,
        'timestamp',
        TIMESTAMP_SECTION_LENGTH,
      )
      && hasSingleSectionWithLength(
        sections,
        'payment_hash',
        PAYMENT_HASH_SECTION_LENGTH,
      )
      && hasSingleDescription(sections)
      && hasSingleSectionWithLength(
        sections,
        'signature',
        SIGNATURE_SECTION_LENGTH,
      )
      && hasSingleSectionWithLength(
        sections,
        'checksum',
        CHECKSUM_SECTION_LENGTH,
      )
    );
  } catch {
    return false;
  }
}

export function parseScannedInvoice(payload: string): ScannedInvoiceResult {
  const value = payload.trim();
  if (!value) {
    return { valid: false, error: 'El QR está vacío.' };
  }

  const lightningUriInvoice = value.replace(LIGHTNING_URI_PREFIX, '').trim();
  if (lightningUriInvoice !== value && isBolt11Invoice(lightningUriInvoice)) {
    return { valid: true, invoice: lightningUriInvoice };
  }

  if (isBolt11Invoice(value)) {
    return { valid: true, invoice: value };
  }

  if (value.toLowerCase().startsWith('bitcoin:')) {
    try {
      const lightningParameter = new URL(value).searchParams.get('lightning')?.trim() ?? '';
      if (isBolt11Invoice(lightningParameter)) {
        return { valid: true, invoice: lightningParameter };
      }
    } catch {
      return { valid: false, error: 'No pudimos interpretar el contenido del QR.' };
    }
  }

  return {
    valid: false,
    error: 'Ese QR no contiene una factura Lightning.',
  };
}
