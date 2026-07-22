/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Entry, ReceiveResult } from '@lightninglabs/wavelength-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

const wallet = vi.hoisted(() => ({
  activity: [] as Entry[],
  history: [] as Entry[],
  receiveResult: null as ReceiveResult | null,
}));
const listActivity = vi.hoisted(() => vi.fn());

type MutableVisualViewport = EventTarget & {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  width: number;
};

let visualViewport: MutableVisualViewport;

vi.mock('@lightninglabs/wavelength-react', async () => {
  const { useState } = await import('react');

  return {
    useWalletActivity: () => wallet.activity,
    useWalletBalance: () => ({ confirmedSat: 0, pendingInSat: 0, pendingOutSat: 0 }),
    useWalletDeposit: () => ({
      deposit: vi.fn(), depositData: null, depositError: null, depositPending: false,
    }),
    useWalletInfo: () => ({ blockHeight: 314_220 }),
    useWalletList: () => ({
      list: listActivity,
      listData: null,
      listError: null,
      listPending: false,
      resetList: vi.fn(),
    }),
    useWalletPrepareSend: () => ({
      prepare: vi.fn(), prepareData: null, prepareError: null, preparePending: false,
    }),
    useWalletReceive: () => {
      const [receiveData, setReceiveData] = useState<ReceiveResult | null>(null);
      const receive = async (): Promise<ReceiveResult> => {
        if (!wallet.receiveResult) throw new Error('Missing mocked receive result');
        setReceiveData(wallet.receiveResult);
        return wallet.receiveResult;
      };

      return { receive, receiveData, receiveError: null, receivePending: false };
    },
    useWalletRecovery: () => ({ acknowledge: vi.fn(), recovery: { status: 'idle' } }),
    useWalletSend: () => ({
      sendData: null, sendError: null, sendPending: false, sendPrepared: vi.fn(),
    }),
  };
});

function receiveEntry(status: Entry['status']): Entry {
  return {
    amountSat: 2_100,
    counterparty: '',
    createdAt: '2026-07-21T19:00:00.000Z',
    cursor: 0,
    failureCode: 'failed',
    failureReason: '',
    feeSat: 0,
    id: 'receive-visible',
    kind: 'receive',
    note: 'Prueba',
    status,
    updatedAt: '2026-07-21T19:00:00.000Z',
  };
}

function historyEntry(
  index: number,
  kind: Entry['kind'],
  requestType: NonNullable<Entry['request']>['type'],
): Entry {
  const incoming = kind === 'receive' || kind === 'deposit';
  return {
    amountSat: (incoming ? 1 : -1) * index * 100,
    counterparty: requestType === 'onchain' ? `tb1qdestination${index}` : '',
    createdAt: `2026-07-${String(22 - index).padStart(2, '0')}T19:00:00.000Z`,
    cursor: index,
    failureCode: 'failed',
    failureReason: '',
    feeSat: index === 2 ? 12 : 0,
    id: `movement-${index}`,
    kind,
    note: index === 2 ? 'Cena' : '',
    request: {
      arkAddress: requestType === 'ark' ? `ark-address-${index}` : '',
      lightningInvoice: requestType === 'lightning' ? `lntbs-invoice-${index}` : '',
      onchainAddress: requestType === 'onchain' ? `tb1qdestination${index}` : '',
      paymentHash: requestType === 'lightning' ? `payment-hash-${index}` : '',
      type: requestType,
    },
    status: 'complete',
    updatedAt: `2026-07-${String(22 - index).padStart(2, '0')}T19:01:00.000Z`,
  };
}

describe('Dashboard receive flow', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(0), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    visualViewport = Object.assign(new EventTarget(), {
      height: 640,
      offsetLeft: 4,
      offsetTop: 120,
      width: 360,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });
    wallet.activity = [];
    wallet.history = [];
    listActivity.mockReset();
    listActivity.mockImplementation(async () => ({
      activity: {
        entries: wallet.history,
        hasMore: false,
        nextCursor: '',
        total: wallet.history.length,
      },
      view: 'activity',
    }));
    wallet.receiveResult = {
      entry: receiveEntry('pending'),
      invoice: 'lntbs21u1rayitoexample',
    };
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
    vi.unstubAllGlobals();
  });

  it('tracks the visible mobile viewport as browser chrome changes', async () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Recibir' }));

    const overlay = screen.getByRole('dialog').parentElement;
    if (!overlay) throw new Error('Missing dialog overlay');

    expect(overlay.style.getPropertyValue('--visual-viewport-top')).toBe('120px');
    expect(overlay.style.getPropertyValue('--visual-viewport-left')).toBe('4px');
    expect(overlay.style.getPropertyValue('--visual-viewport-width')).toBe('360px');
    expect(overlay.style.getPropertyValue('--visual-viewport-height')).toBe('640px');

    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    const memoInput = screen.getByLabelText('Concepto (opcional)');
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(memoInput).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    act(() => {
      visualViewport.height = 420;
      visualViewport.offsetTop = 180;
      visualViewport.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(overlay.style.getPropertyValue('--visual-viewport-top')).toBe('180px');
      expect(overlay.style.getPropertyValue('--visual-viewport-height')).toBe('420px');
    });
  });

  it('shows the invoice QR, then closes the modal and announces its confirmation', async () => {
    const view = render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Recibir' }));
    fireEvent.change(screen.getByLabelText('Monto en sats'), { target: { value: '2100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear factura' }));

    expect(await screen.findByRole('img', { name: 'QR para pagar la factura Lightning' }))
      .toBeInTheDocument();
    expect(screen.getByText('Esperando 2.100 sats')).toBeInTheDocument();
    expect(screen.getByTitle('lntbs21u1rayitoexample')).toBeInTheDocument();

    wallet.activity = [receiveEntry('pending')];
    view.rerender(<Dashboard />);
    await waitFor(() => expect(screen.getByText('Esperando 2.100 sats')).toBeInTheDocument());

    wallet.activity = [receiveEntry('complete')];
    view.rerender(<Dashboard />);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Pago recibido')).toBeInTheDocument();
    expect(screen.getByText('2.100 sats ya están disponibles.')).toBeInTheDocument();
  });

  it('rejects out-of-range Lightning and on-chain amounts before submission', () => {
    render(<Dashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Recibir' }));
    fireEvent.change(screen.getByLabelText('Monto en sats'), {
      target: { value: '9999999999999999' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('supera el máximo posible');
    expect(screen.getByRole('button', { name: 'Crear factura' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    fireEvent.change(screen.getByLabelText('Factura Lightning o dirección'), {
      target: { value: 'tb1qdestination' },
    });
    fireEvent.change(screen.getByLabelText('Monto en sats'), {
      target: { value: '9999999999999999' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('supera el máximo posible');
    expect(screen.getByRole('button', { name: 'Revisar pago' })).toBeDisabled();
  });

  it('shows five recent movements and supports history filters and full details', async () => {
    const entries = [
      historyEntry(1, 'receive', 'lightning'),
      historyEntry(2, 'send', 'lightning'),
      historyEntry(3, 'deposit', 'onchain'),
      historyEntry(4, 'exit', 'onchain'),
      historyEntry(5, 'send', 'onchain'),
      historyEntry(6, 'send', 'ark'),
      historyEntry(7, 'receive', 'lightning'),
    ];
    wallet.activity = entries.slice(0, 5);
    wallet.history = entries;
    listActivity.mockImplementation(async (request: { cursor?: string }) => {
      const firstPage = !request.cursor;
      const pageEntries = firstPage ? entries.slice(0, 5) : entries.slice(5);
      return {
        activity: {
          entries: pageEntries,
          hasMore: firstPage,
          nextCursor: firstPage ? 'older-page' : '',
          total: pageEntries.length,
        },
        view: 'activity',
      };
    });

    render(<Dashboard />);

    const activityRegion = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(within(activityRegion).getAllByRole('button', { name: /^Ver detalles:/ }))
      .toHaveLength(5);

    fireEvent.click(within(activityRegion).getByRole('button', {
      name: /^Ver detalles: Recepción, Ingreso, 100 sats/,
    }));
    const directDetail = screen.getByRole('dialog', { name: 'Detalle del movimiento' });
    expect(within(directDetail).getByText('movement-1')).toBeInTheDocument();
    fireEvent.click(within(directDetail).getByRole('button', { name: 'Cerrar' }));
    listActivity.mockClear();

    fireEvent.click(within(activityRegion).getByRole('button', { name: 'Ver todos' }));
    const historyDialog = await screen.findByRole('dialog', { name: 'Historial de movimientos' });
    await waitFor(() => expect(listActivity).toHaveBeenCalledWith({
      cursor: '',
      limit: 50,
      view: 'activity',
    }));
    await waitFor(() => expect(listActivity).toHaveBeenCalledWith({
      cursor: 'older-page',
      limit: 50,
      view: 'activity',
    }));
    await waitFor(() => expect(
      within(historyDialog).getAllByRole('button', { name: /^Ver detalles:/ }),
    ).toHaveLength(7));

    const historyScrollPort = historyDialog.querySelector<HTMLElement>('.action-panel-body');
    if (!historyScrollPort) throw new Error('Missing activity history scroll port');
    historyScrollPort.scrollTop = 120;
    fireEvent.click(within(historyDialog).getByRole('button', { name: 'Egresos' }));
    expect(historyScrollPort.scrollTop).toBe(0);
    expect(within(historyDialog).getAllByRole('button', { name: /^Ver detalles:/ }))
      .toHaveLength(4);

    fireEvent.click(within(historyDialog).getByRole('button', { name: 'On-chain' }));
    expect(within(historyDialog).getAllByRole('button', { name: /^Ver detalles:/ }))
      .toHaveLength(3);

    fireEvent.click(within(historyDialog).getByRole('button', { name: 'Lightning' }));
    expect(within(historyDialog).getAllByRole('button', { name: /^Ver detalles:/ }))
      .toHaveLength(3);

    fireEvent.click(within(historyDialog).getByRole('button', { name: 'Todos' }));
    fireEvent.click(within(historyDialog).getByRole('button', {
      name: /^Ver detalles: Envío, Egreso, 200 sats/,
    }));

    const detailDialog = screen.getByRole('dialog', { name: 'Detalle del movimiento' });
    expect(within(detailDialog).getByRole('button', { name: 'Volver al historial' }))
      .toHaveFocus();
    expect(within(detailDialog).getByText('movement-2')).toBeInTheDocument();
    expect(within(detailDialog).getByText('Cena')).toBeInTheDocument();
    expect(within(detailDialog).getByText('12 sats')).toBeInTheDocument();
    expect(within(detailDialog).getByText('lntbs-invoice-2')).toBeInTheDocument();

    fireEvent.click(within(detailDialog).getByRole('button', { name: 'Volver al historial' }));
    const restoredHistory = screen.getByRole('dialog', { name: 'Historial de movimientos' });
    expect(within(restoredHistory).getByRole('button', {
      name: /^Ver detalles: Envío, Egreso, 200 sats/,
    })).toHaveFocus();
  });
});
