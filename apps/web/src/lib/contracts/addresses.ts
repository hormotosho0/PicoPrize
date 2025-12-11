// Contract addresses for PicoPrize
// Supports both Celo Mainnet and Sepolia testnet
export const CONTRACT_ADDRESSES = {
  PICOPRIZE_POOL: process.env.NEXT_PUBLIC_PICOPRIZE_POOL_ADDRESS as `0x${string}`,
  PICOPRIZE_REPUTATION: process.env.NEXT_PUBLIC_PICOPRIZE_REPUTATION_ADDRESS as `0x${string}`,
  PICOPRIZE_COMMIT_REVEAL: process.env.NEXT_PUBLIC_PICOPRIZE_COMMIT_REVEAL_ADDRESS as `0x${string}`,
  CUSD: process.env.NEXT_PUBLIC_CUSD_ADDRESS as `0x${string}`,
} as const

// Chain configuration
export const CELO_MAINNET_CHAIN_ID = 42220
export const CELO_SEPOLIA_CHAIN_ID = 11142220

// Determine active chain ID based on environment
export const ACTIVE_CHAIN_ID = process.env.NEXT_PUBLIC_NETWORK === "sepolia" 
  ? CELO_SEPOLIA_CHAIN_ID 
  : CELO_MAINNET_CHAIN_ID

// Fallback addresses (for development/testing only)
// ⚠️ These are old development addresses and should NOT be used in production
// Production addresses must be set via environment variables
export const DEFAULT_ADDRESSES = {
  PICOPRIZE_POOL: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  PICOPRIZE_REPUTATION: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  PICOPRIZE_COMMIT_REVEAL: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  CUSD: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const

// Get address with fallback
export function getContractAddress(contract: keyof typeof CONTRACT_ADDRESSES): `0x${string}` {
  return CONTRACT_ADDRESSES[contract] || DEFAULT_ADDRESSES[contract]
}

