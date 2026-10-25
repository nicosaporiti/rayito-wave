import { useState, type ReactElement } from 'react';
import { useWallet } from '@lightninglabs/wavelength-react';
import { useI18n } from '../i18n/useI18n';
import {
  activeNetwork,
  NETWORK_PROFILES,
  NETWORKS,
  switchNetwork,
  useNetworkHeld,
  type WalletNetwork,
} from '../lib/network';
import { Dialog } from './Dialog';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const NETWORK_DETAIL = {
  signet: 'network.signet.detail',
  testnet: 'network.testnet.detail',
} as const satisfies Record<WalletNetwork, 'network.signet.detail' | 'network.testnet.detail'>;

type NetworkSwitchProps = {
  /**
   * `badge` sits in the header, which has no room for it on phones; `inline`
   * is plain text that phones reach from the footer and the dashboard.
   */
  readonly variant?: 'badge' | 'inline';
};

export function NetworkSwitch({ variant = 'badge' }: NetworkSwitchProps): ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // The accessible name starts with the visible text, so voice control users
  // can say what they see.
  const visible = variant === 'badge' ? t('brand.network') : NETWORK_PROFILES[activeNetwork()].label;
  const trigger = {
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-label': t('network.switch.aria', { visible }),
    onClick: () => setOpen(true),
  } as const;

  return (
    <>
      {variant === 'badge' ? (
        <Badge className="network-badge network-status" variant="outline" asChild>
          <button {...trigger}>
            <span className="network-status__dot" aria-hidden="true" />
            {visible}
          </button>
        </Badge>
      ) : (
        <button className="network-inline" {...trigger}>{visible}</button>
      )}
      {open && <NetworkDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NetworkDialog({ onClose }: { readonly onClose: () => void }): ReactElement {
  const { t } = useI18n();
  const { stop } = useWallet();
  const held = useNetworkHeld();
  const current = activeNetwork();
  const [switching, setSwitching] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);

  const choose = async (network: WalletNetwork): Promise<void> => {
    setSwitching(true);
    setStorageBlocked(false);
    if (!await switchNetwork(network, stop)) {
      setSwitching(false);
      setStorageBlocked(true);
    }
  };

  return (
    <Dialog ariaLabel={t('network.dialog.title')} onClose={onClose}>
      <div className="network-view">
        <span className="step-label">{t('network.dialog.eyebrow')}</span>
        <h2>{t('network.dialog.title')}</h2>
        <p>{t('network.dialog.intro')}</p>
        <ul className="network-options">
          {NETWORKS.map((network) => {
            const { label } = NETWORK_PROFILES[network];
            const isCurrent = network === current;
            return (
              <li key={network} className="network-option" aria-current={isCurrent || undefined}>
                <div>
                  <strong>{label}</strong>
                  <p>{t(NETWORK_DETAIL[network])}</p>
                </div>
                {isCurrent ? (
                  <Badge className="network-option__current" variant="outline">
                    {t('network.dialog.current')}
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={held || switching}
                    onClick={() => void choose(network)}
                  >
                    {t(switching ? 'network.dialog.switching' : 'network.dialog.switch', { target: label })}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {held && (
          <p className="network-held" role="status">{t('network.dialog.held')}</p>
        )}
        <Alert className="network-warning" role="note">
          <AlertDescription>{t('network.dialog.warning')}</AlertDescription>
        </Alert>
        {storageBlocked && (
          <p className="network-error" role="alert">{t('network.dialog.storage')}</p>
        )}
      </div>
    </Dialog>
  );
}
