import type {
  EntryFailureCode,
  EntryKind,
  EntryPhase,
  EntryStatus,
} from '@lightninglabs/wavelength-react';

const integerFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const fullDateFormat = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export const formatSats = (value: number): string => integerFormat.format(value);

export const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Ahora' : dateFormat.format(date);
};

export const formatFullDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha disponible' : fullDateFormat.format(date);
};

export const entryKindLabel = (kind: EntryKind): string => {
  switch (kind) {
    case 'send': return 'Envío';
    case 'receive': return 'Recepción';
    case 'deposit': return 'Depósito';
    case 'exit': return 'Retiro';
    default: return kind satisfies never;
  }
};

export const entryPhaseLabel = (phase: EntryPhase): string => {
  switch (phase) {
    case 'unspecified': return 'Sin detalle';
    case 'request_created': return 'Solicitud creada';
    case 'waiting_for_payment': return 'Esperando pago';
    case 'payment_detected': return 'Pago detectado';
    case 'settling': return 'Liquidando';
    case 'confirmed': return 'Confirmado';
    case 'refunding': return 'Reembolsando';
    case 'refunded': return 'Reembolsado';
    case 'failed': return 'Falló';
    case 'waiting_for_confirmation': return 'Esperando confirmación';
    default: return phase satisfies never;
  }
};

export const entryFailureLabel = (code: EntryFailureCode): string => {
  switch (code) {
    case 'timed_out': return 'Tiempo de espera agotado';
    case 'expired': return 'Solicitud vencida';
    case 'refunded': return 'Pago reembolsado';
    case 'needs_intervention': return 'Requiere intervención';
    case 'failed': return 'Falló';
    default: return code satisfies never;
  }
};

export const entryStatusLabel = (status: EntryStatus): string => {
  switch (status) {
    case 'pending': return 'En curso';
    case 'complete': return 'Completado';
    case 'failed': return 'Falló';
    default: return status satisfies never;
  }
};
