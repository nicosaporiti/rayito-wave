/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Brand } from './Brand';

describe('Brand', () => {
  it('uses internal home navigation instead of reloading the page', () => {
    const onHome = vi.fn();
    render(<Brand onHome={onHome} />);

    const link = screen.getByRole('link', { name: 'Rayito, inicio' });
    expect(fireEvent.click(link)).toBe(false);
    expect(onHome).toHaveBeenCalledOnce();
  });
});
