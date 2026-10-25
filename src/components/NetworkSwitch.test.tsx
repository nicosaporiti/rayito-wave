/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetActiveNetwork, holdNetwork } from '../lib/network';
import { render } from '../test/render';
import { NetworkSwitch } from './NetworkSwitch';

const mocks = vi.hoisted(() => ({
  stop: vi.fn(async () => undefined),
  switchNetwork: vi.fn(async () => true),
}));

vi.mock('@lightninglabs/wavelength-react', () => ({
  useWallet: () => ({ stop: mocks.stop }),
}));

vi.mock('../lib/network', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/network')>(),
  switchNetwork: mocks.switchNetwork,
}));

function storeNetwork(network: string): void {
  localStorage.setItem('rayito.network', network);
  forgetActiveNetwork();
}

function openDialog(name = 'Signet · prueba: cambiar de red'): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog', { name: 'Cambiar de red' });
}

describe('NetworkSwitch', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    forgetActiveNetwork();
    mocks.stop.mockClear();
    mocks.switchNetwork.mockReset();
    mocks.switchNetwork.mockResolvedValue(true);
  });

  it('shows the active network and switches to the other one', () => {
    render(<NetworkSwitch />);

    const trigger = screen.getByRole('button', { name: 'Signet · prueba: cambiar de red' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const dialog = openDialog();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialog).getByText('En uso')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cambiar a Signet' })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/empiezan con tb1/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' }));
    expect(mocks.switchNetwork).toHaveBeenCalledWith('testnet', mocks.stop);
  });

  it('names the stored network and offers to go back to Signet', () => {
    storeNetwork('testnet');
    render(<NetworkSwitch />);

    const dialog = openDialog('Testnet3 · prueba: cambiar de red');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar a Signet' }));
    expect(mocks.switchNetwork).toHaveBeenCalledWith('signet', mocks.stop);
  });

  it('keeps the network this page load started on when another tab switches', () => {
    render(<NetworkSwitch variant="inline" />);
    localStorage.setItem('rayito.network', 'testnet');
    window.dispatchEvent(new StorageEvent('storage', { key: 'rayito.network', newValue: 'testnet' }));

    const dialog = openDialog('Signet: cambiar de red');
    expect(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' })).toBeInTheDocument();
  });

  it('explains when the browser will not store the choice', async () => {
    mocks.switchNetwork.mockResolvedValue(false);
    render(<NetworkSwitch />);

    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('seguimos en Signet');
    expect(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' })).toBeEnabled();
  });

  it('refuses to switch while work a reload would abandon is in progress', () => {
    const release = holdNetwork();
    render(<NetworkSwitch />);

    const dialog = openDialog();
    expect(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' })).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Termina primero lo que está en curso');

    act(release);
    expect(within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' })).toBeEnabled();
  });

  it('keeps keyboard focus inside the dialog when its parent re-renders', async () => {
    const view = render(<NetworkSwitch />);

    const dialog = openDialog();
    const target = within(dialog).getByRole('button', { name: 'Cambiar a Testnet3' });
    target.focus();
    view.rerender(<NetworkSwitch />);

    await waitFor(() => expect(target).toHaveFocus());
  });

  it('offers the same switch as plain text where the header badge does not fit', () => {
    render(<NetworkSwitch variant="inline" />);

    const trigger = screen.getByRole('button', { name: 'Signet: cambiar de red' });
    expect(trigger).toHaveTextContent(/^Signet$/);
    openDialog('Signet: cambiar de red');
  });

  it('falls back to Signet for an unknown stored network', () => {
    storeNetwork('mainnet');
    render(<NetworkSwitch />);

    expect(screen.getByRole('button', { name: 'Signet · prueba: cambiar de red' }))
      .toBeInTheDocument();
  });
});
