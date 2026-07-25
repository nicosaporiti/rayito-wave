import type { MessageKey } from '../i18n/messages';

export type ReceiveProgressStage = 'route' | 'swap' | 'slow';

export type ReceiveProgress = {
  readonly stage: ReceiveProgressStage;
  readonly titleKey: MessageKey;
  readonly detailKey: MessageKey;
};

export function receiveProgressFor(elapsedSeconds: number): ReceiveProgress {
  if (elapsedSeconds < 5) {
    return {
      stage: 'route',
      titleKey: 'receive.progress.route.title',
      detailKey: 'receive.progress.route.detail',
    };
  }

  if (elapsedSeconds < 15) {
    return {
      stage: 'swap',
      titleKey: 'receive.progress.swap.title',
      detailKey: 'receive.progress.swap.detail',
    };
  }

  return {
    stage: 'slow',
    titleKey: 'receive.progress.slow.title',
    detailKey: 'receive.progress.slow.detail',
  };
}
