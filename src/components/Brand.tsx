import type { MouseEvent } from 'react';
import { RayitoMark } from './RayitoMark';
import { Badge } from './ui/badge';

type BrandProps = {
  readonly onHome: () => void;
};

export function Brand({ onHome }: BrandProps) {
  const navigateHome = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    onHome();
  };

  return (
    <a
      className="brand wallet-brand"
      href="/"
      aria-label="Rayito, inicio"
      onClick={navigateHome}
    >
      <span className="brand-mark wallet-brand__mark">
        <RayitoMark />
      </span>
      <span className="brand-name wallet-brand__name">rayito</span>
    </a>
  );
}

export function NetworkBadge() {
  return (
    <Badge className="network-badge network-status" variant="outline">
      <span className="network-status__dot" aria-hidden="true" />
      Signet · prueba
    </Badge>
  );
}
