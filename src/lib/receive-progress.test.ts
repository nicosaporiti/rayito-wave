import { describe, expect, it } from 'vitest';
import { receiveProgressFor } from './receive-progress';

describe('receiveProgressFor', () => {
  it('moves from route lookup to swap preparation and slow-backend warning', () => {
    expect(receiveProgressFor(0).stage).toBe('route');
    expect(receiveProgressFor(5).stage).toBe('swap');
    expect(receiveProgressFor(15).stage).toBe('slow');
  });
});
