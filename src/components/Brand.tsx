import { BoltIcon } from './Icons';

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Rayito, inicio">
      <span className="brand-mark"><BoltIcon /></span>
      <span>rayito</span>
    </a>
  );
}

export function NetworkBadge() {
  return <span className="network-badge"><span /> Signet · prueba</span>;
}
