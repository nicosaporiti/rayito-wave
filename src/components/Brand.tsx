import type { MouseEvent } from 'react';
import { useI18n } from '../i18n/useI18n';
import { RayitoMark } from './RayitoMark';

type BrandProps = {
  readonly onHome: () => void;
};

export function Brand({ onHome }: BrandProps) {
  const { t } = useI18n();
  const navigateHome = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    onHome();
  };

  return (
    <a
      className="brand wallet-brand"
      href="/"
      aria-label={t('brand.home')}
      onClick={navigateHome}
    >
      <span className="brand-mark wallet-brand__mark">
        <RayitoMark />
      </span>
      <span className="brand-name wallet-brand__name">rayito</span>
      <span className="wallet-brand__tagline">{t('brand.tagline')}</span>
    </a>
  );
}
