import type { Entry } from '@lightninglabs/wavelength-react';

export const DEPOSIT_CONFIRMATION_TARGET = 1;

type EsploraTransactionStatus = {
  readonly confirmed: boolean;
  readonly blockHeight: number | null;
};

export type EsploraDeposit = {
  readonly amountSat: number;
  readonly status: EsploraTransactionStatus;
  readonly txid: string;
};

export type DepositMonitorState =
  | {
      readonly stage: 'waiting';
      readonly progress: 8;
      readonly title: 'Esperando fondos';
      readonly detail: 'Todavía no aparece en la red';
    }
  | {
      readonly stage: 'mempool';
      readonly progress: 46;
      readonly title: 'Fondos ingresando';
      readonly detail: '0/1 confirmación · falta 1';
      readonly amountSat: number;
      readonly txid: string;
    }
  | {
      readonly stage: 'boarding';
      readonly progress: 78;
      readonly title: 'Confirmado en Bitcoin';
      readonly detail: 'Ingresando a Ark';
      readonly amountSat: number;
      readonly confirmations: number;
      readonly txid: string;
    }
  | {
      readonly stage: 'complete';
      readonly progress: 100;
      readonly title: 'Fondos disponibles';
      readonly detail: 'Listos para usar';
      readonly amountSat: number;
      readonly txid: string;
    }
  | {
      readonly stage: 'failed';
      readonly progress: 100;
      readonly title: 'No se pudo acreditar';
      readonly detail: string;
    };

type EsploraTransaction = {
  readonly txid: string;
  readonly status: EsploraTransactionStatus;
  readonly vout: readonly {
    readonly address: string;
    readonly value: number;
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStatus(value: unknown): EsploraTransactionStatus | null {
  if (!isRecord(value) || typeof value.confirmed !== 'boolean') return null;

  const blockHeight = value.block_height;
  if (blockHeight !== undefined && (!Number.isSafeInteger(blockHeight) || Number(blockHeight) < 0)) {
    return null;
  }

  return {
    confirmed: value.confirmed,
    blockHeight: typeof blockHeight === 'number' ? blockHeight : null,
  };
}

function parseTransaction(value: unknown): EsploraTransaction | null {
  if (!isRecord(value) || typeof value.txid !== 'string' || !Array.isArray(value.vout)) return null;

  const status = parseStatus(value.status);
  if (!status) return null;

  const vout = value.vout.flatMap((output) => {
    if (
      !isRecord(output)
      || typeof output.scriptpubkey_address !== 'string'
      || !Number.isSafeInteger(output.value)
      || Number(output.value) < 0
    ) {
      return [];
    }

    return [{
      address: output.scriptpubkey_address,
      value: Number(output.value),
    }];
  });

  return { txid: value.txid, status, vout };
}

export function parseEsploraDeposit(raw: unknown, address: string): EsploraDeposit | null {
  if (!Array.isArray(raw)) throw new Error('Esplora devolvió una lista de transacciones inválida.');

  const transactions = raw.map(parseTransaction).filter((tx) => tx !== null);
  const fundingTransaction = transactions.find((tx) => (
    tx.vout.some((output) => output.address === address && output.value > 0)
  ));
  if (!fundingTransaction) return null;

  return {
    amountSat: fundingTransaction.vout
      .filter((output) => output.address === address)
      .reduce((total, output) => total + output.value, 0),
    status: fundingTransaction.status,
    txid: fundingTransaction.txid,
  };
}

export function parseTipHeight(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Esplora devolvió una altura de bloque inválida.');
  }
  return value;
}

export function depositConfirmations(
  deposit: EsploraDeposit | null,
  tipHeight: number | null,
): number {
  const confirmationHeight = deposit?.status.blockHeight;
  if (!deposit?.status.confirmed || confirmationHeight == null || tipHeight === null) return 0;
  return Math.max(1, tipHeight - confirmationHeight + 1);
}

function wavelengthDepositConfirmations(entry: Entry): number {
  const progress = entry.progress;
  if (!progress) return 0;

  const confirmedByHeight = progress.confirmationHeight > 0;
  const confirmedByPhase = progress.phase === 'confirmed';
  return confirmedByHeight || confirmedByPhase ? DEPOSIT_CONFIRMATION_TARGET : 0;
}

export function depositMonitorState(
  entry: Entry,
  deposit: EsploraDeposit | null,
  tipHeight: number | null,
): DepositMonitorState {
  if (entry.status === 'failed') {
    return {
      stage: 'failed',
      progress: 100,
      title: 'No se pudo acreditar',
      detail: entry.failureReason || 'Revisá el movimiento para ver el detalle',
    };
  }

  const amountSat = deposit?.amountSat ?? Math.max(0, entry.amountSat);
  const txid = deposit?.txid ?? entry.progress?.txid ?? '';

  if (entry.status === 'complete') {
    return {
      stage: 'complete',
      progress: 100,
      title: 'Fondos disponibles',
      detail: 'Listos para usar',
      amountSat,
      txid,
    };
  }

  const confirmations = Math.max(
    depositConfirmations(deposit, tipHeight),
    wavelengthDepositConfirmations(entry),
  );
  if (confirmations >= DEPOSIT_CONFIRMATION_TARGET) {
    return {
      stage: 'boarding',
      progress: 78,
      title: 'Confirmado en Bitcoin',
      detail: 'Ingresando a Ark',
      amountSat,
      confirmations,
      txid,
    };
  }

  const paymentDetected = Boolean(deposit)
    || entry.progress?.phase === 'payment_detected'
    || entry.progress?.phase === 'waiting_for_confirmation'
    || Boolean(entry.progress?.txid);

  if (paymentDetected) {
    return {
      stage: 'mempool',
      progress: 46,
      title: 'Fondos ingresando',
      detail: '0/1 confirmación · falta 1',
      amountSat,
      txid,
    };
  }

  return {
    stage: 'waiting',
    progress: 8,
    title: 'Esperando fondos',
    detail: 'Todavía no aparece en la red',
  };
}
