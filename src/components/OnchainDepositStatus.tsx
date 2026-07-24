import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { Entry } from '@lightninglabs/wavelength-react';
import { formatSats } from '../lib/format';
import {
  depositMonitorState,
  parseEsploraDeposit,
  parseTipHeight,
  type EsploraDeposit,
} from '../lib/onchain-deposit';
import { Progress } from './ui/progress';

const SIGNET_ESPLORA_API = 'https://mempool-signet.testnet.lightningcluster.com/api';
const POLL_INTERVAL_MS = 10_000;

type OnchainDepositStatusProps = {
  readonly address: string;
  readonly entry: Entry;
};

type ChainSnapshot = {
  readonly address: string;
  readonly deposit: EsploraDeposit | null;
  readonly tipHeight: number | null;
  readonly unavailable: boolean;
};

function isTerminalDeposit(entry: Entry): boolean {
  return entry.status === 'complete' || entry.status === 'failed';
}

const EMPTY_SNAPSHOT: ChainSnapshot = {
  address: '',
  deposit: null,
  tipHeight: null,
  unavailable: false,
};

async function fetchChainSnapshot(address: string, signal: AbortSignal): Promise<ChainSnapshot> {
  const encodedAddress = encodeURIComponent(address);
  const [transactionsResponse, tipResponse] = await Promise.all([
    fetch(`${SIGNET_ESPLORA_API}/address/${encodedAddress}/txs`, { signal }),
    fetch(`${SIGNET_ESPLORA_API}/blocks/tip/height`, { signal }),
  ]);

  if (!transactionsResponse.ok || !tipResponse.ok) {
    throw new Error(`Esplora no respondió (${transactionsResponse.status}/${tipResponse.status}).`);
  }

  const [transactions, tip] = await Promise.all([
    transactionsResponse.json() as Promise<unknown>,
    tipResponse.text(),
  ]);

  return {
    address,
    deposit: parseEsploraDeposit(transactions, address),
    tipHeight: parseTipHeight(tip),
    unavailable: false,
  };
}

export function OnchainDepositStatus({
  address,
  entry,
}: OnchainDepositStatusProps): ReactElement {
  const [snapshot, setSnapshot] = useState<ChainSnapshot>(EMPTY_SNAPSHOT);
  const terminal = isTerminalDeposit(entry);

  const refresh = useCallback(async (signal: AbortSignal): Promise<void> => {
    try {
      const nextSnapshot = await fetchChainSnapshot(address, signal);
      if (signal.aborted) return;
      setSnapshot(nextSnapshot);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setSnapshot((current) => {
        if (current.address === address) return { ...current, unavailable: true };
        return { ...EMPTY_SNAPSHOT, address, unavailable: true };
      });
    }
  }, [address]);

  useEffect(() => {
    if (terminal) return undefined;

    const controller = new AbortController();
    let stopped = false;
    let timer: number | undefined;

    const poll = async (): Promise<void> => {
      if (document.visibilityState === 'visible') {
        await refresh(controller.signal);
      }
      if (stopped) return;
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(() => void poll(), 0);

    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refresh, terminal]);

  const visibleSnapshot = snapshot.address === address
    ? snapshot
    : { ...EMPTY_SNAPSHOT, address };
  const state = depositMonitorState(entry, visibleSnapshot.deposit, visibleSnapshot.tipHeight);
  const hasAmount = state.stage !== 'waiting' && state.stage !== 'failed' && state.amountSat > 0;
  const txUrl = 'txid' in state && state.txid
    ? `https://mempool.space/signet/tx/${encodeURIComponent(state.txid)}`
    : '';

  return (
    <section
      className={`deposit-status deposit-status--${state.stage}`}
      aria-label="Estado del depósito on-chain"
      aria-live="polite"
    >
      <div className="deposit-status__line">
        <span className="deposit-status__pulse" aria-hidden="true" />
        <strong>{state.title}</strong>
        {hasAmount && <span className="deposit-status__amount">+{formatSats(state.amountSat)} sats</span>}
        <span className="deposit-status__detail">{state.detail}</span>
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noopener noreferrer">
            Ver tx
          </a>
        )}
      </div>
      <Progress
        className="deposit-status__progress"
        value={state.progress}
        aria-label={`${state.title}: ${state.progress}%`}
      />
      {visibleSnapshot.unavailable && (
        <span className="deposit-status__offline">Actualización de red pausada</span>
      )}
    </section>
  );
}
