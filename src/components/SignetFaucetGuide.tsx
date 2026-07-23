import type { ReactElement } from 'react';
import { LinkIcon } from './Icons';

const SIGNET_FAUCET_URL = 'https://bitcoinsignetfaucet.com/';
const SIGNET_MEMPOOL_ADDRESS_URL = 'https://mempool.space/signet/address/';

type SignetFaucetGuideProps = {
  readonly address: string;
};

export function SignetFaucetGuide({ address }: SignetFaucetGuideProps): ReactElement {
  const mempoolAddressUrl = `${SIGNET_MEMPOOL_ADDRESS_URL}${encodeURIComponent(address)}`;

  return (
    <section className="signet-guide" aria-labelledby="signet-guide-title">
      <p className="signet-guide-kicker">Siguiente paso</p>
      <h3 id="signet-guide-title">Cómo cargar sats de prueba</h3>
      <ol>
        <li>
          <span aria-hidden="true">1</span>
          <p><strong>Copiá la dirección</strong> Signet que aparece arriba.</p>
        </li>
        <li>
          <span aria-hidden="true">2</span>
          <p><strong>Abrí el faucet</strong> en una pestaña nueva.</p>
        </li>
        <li>
          <span aria-hidden="true">3</span>
          <p><strong>Pegá la dirección</strong>, elegí un monto permitido y completá la verificación.</p>
        </li>
        <li>
          <span aria-hidden="true">4</span>
          <p><strong>Seguí el depósito</strong> en mempool Signet. Aparece cuando el faucet publica el lote y Rayito lo acredita después de la confirmación.</p>
        </li>
      </ol>
      <div className="signet-guide-actions">
        <a
          className="signet-faucet-link"
          href={SIGNET_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir Bitcoin Signet Faucet en una pestaña nueva"
        >
          Abrir Bitcoin Signet Faucet
          <LinkIcon />
        </a>
        <a
          className="signet-mempool-link"
          href={mempoolAddressUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Seguir esta dirección en mempool Signet en una pestaña nueva"
        >
          Seguir en mempool Signet
          <LinkIcon />
        </a>
      </div>
      <p className="signet-guide-note">
        El faucet es un servicio externo y puede quedarse temporalmente sin fondos o limitar solicitudes.
      </p>
    </section>
  );
}
