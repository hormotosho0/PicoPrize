// Contract ABIs
export { PicoPrizePoolABI } from "./abis/PicoPrizePool"
export { PicoPrizeReputationABI } from "./abis/PicoPrizeReputation"
export { ERC20ABI } from "./abis/ERC20"

// Contract Addresses
export { 
  CONTRACT_ADDRESSES, 
  DEFAULT_ADDRESSES, 
  CELO_MAINNET_CHAIN_ID,
  CELO_SEPOLIA_CHAIN_ID,
  ACTIVE_CHAIN_ID,
  getContractAddress 
} from "./addresses"

// Types
export type PoolStatus = 0 | 1 | 2 | 3 // Active, Closed, Resolved, Cancelled

export interface Pool {
  id: bigint
  creator: `0x${string}`
  metadataUri: string
  choicesCount: number
  deadline: bigint
  minStake: bigint
  maxStake: bigint
  creatorSeed: bigint
  platformFeeBps: bigint
  creatorFeeBps: bigint
  totalStaked: bigint
  winningChoice: number
  status: PoolStatus
  createdAt: bigint
  resolvedAt: bigint
}

export interface UserStake {
  amount: bigint
  claimed: boolean
}

export interface UserStats {
  totalPoints: bigint
  lessonsCompleted: bigint
  challengesWon: bigint
  challengesLost: bigint
  totalStaked: bigint
  totalWon: bigint
  currentStreak: bigint
  longestStreak: bigint
  lastActivityTimestamp: bigint
  registeredAt: bigint
}

export interface CreatorStats {
  lessonsCreated: bigint
  totalParticipants: bigint
  totalPoolsSeeded: bigint
  totalFeesEarned: bigint
  averageRating: bigint
  ratingCount: bigint
}

export interface Achievement {
  name: string
  description: string
  imageUri: string
  requiredPoints: bigint
  exists: boolean
}

// Helper functions
export function formatCUSD(amount: bigint, decimals: number = 18): string {
  const value = Number(amount) / Math.pow(10, decimals)
  return value.toFixed(value < 1 ? 4 : 2)
}

export function parseCUSD(amount: string | number, decimals: number = 18): bigint {
  const value = typeof amount === "string" ? parseFloat(amount) : amount
  return BigInt(Math.floor(value * Math.pow(10, decimals)))
}

export function getPoolStatusLabel(status: PoolStatus): string {
  switch (status) {
    case 0: return "Active"
    case 1: return "Closed"
    case 2: return "Resolved"
    case 3: return "Cancelled"
    default: return "Unknown"
  }
}

export function isPoolActive(status: PoolStatus): boolean {
  return status === 0
}

export function isPoolResolved(status: PoolStatus): boolean {
  return status === 2
}

export function isPoolCancelled(status: PoolStatus): boolean {
  return status === 3
}

export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

