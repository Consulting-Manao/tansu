import { DRIPS_CONFIG, validateProposalTiming } from '../config/drips';

describe('DRIPS Timing Configuration', () => {
  test('should have valid default timing values', () => {
    expect(DRIPS_CONFIG.proposalDuration).toBe(5760);
    expect(DRIPS_CONFIG.proposalCooldown).toBe(1440);
  });

  test('validateProposalTiming should accept valid values', () => {
    expect(validateProposalTiming(5760, 1440)).toBe(true);
    expect(validateProposalTiming(10000, 5000)).toBe(true);
  });

  test('validateProposalTiming should reject invalid values', () => {
    expect(validateProposalTiming(0, 1440)).toBe(false);
    expect(validateProposalTiming(5760, 0)).toBe(false);
    expect(validateProposalTiming(1000, 2000)).toBe(false);
  });
});
