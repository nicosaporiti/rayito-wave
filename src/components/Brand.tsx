import { BoltIcon } from './Icons';
import { Badge } from './ui/badge';

export function Brand() {
  return (
    <a className="brand wallet-brand" href="/" aria-label="Rayito, inicio">
      <span className="brand-mark wallet-brand__mark"><BoltIcon /></span>
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
