// DRIPS Module Configuration
// Adjust timing settings for proposals as per issue #249

export const DRIPS_CONFIG = {
  // Proposal timing (in blocks)
  proposalDuration: 5760, // 24 hours (assuming 15s blocks)
  proposalCooldown: 1440, // 1 hour cooldown between proposals
  
  // Other DRIPS settings remain unchanged
  maxRecipients: 100,
  defaultFundingAmount: 1000,
  minFundingAmount: 100,
};

// Validation function for timing constraints
export function validateProposalTiming(duration: number, cooldown: number): boolean {
  return duration > 0 && cooldown > 0 && duration >= cooldown;
}
