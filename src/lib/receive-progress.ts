export type ReceiveProgress = {
  readonly stage: 'route' | 'swap' | 'slow';
  readonly title: string;
  readonly detail: string;
};

export function receiveProgressFor(elapsedSeconds: number): ReceiveProgress {
  if (elapsedSeconds < 5) {
    return {
      stage: 'route',
      title: 'Buscando una ruta Lightning',
      detail: 'Consultando al servidor de swaps de Signet.',
    };
  }

  if (elapsedSeconds < 15) {
    return {
      stage: 'swap',
      title: 'Preparando el swap',
      detail: 'Wavelength está reservando la ruta y firmando la factura.',
    };
  }

  return {
    stage: 'slow',
    title: 'Signet está respondiendo lento',
    detail: 'No reintentes todavía: la solicitud sigue activa y podría crear una factura duplicada.',
  };
}
