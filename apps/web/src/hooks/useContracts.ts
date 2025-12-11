"use client"

import { useMemo } from "react"
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi"
import { 
  PicoPrizePoolABI, 
  PicoPrizeReputationABI, 
  ERC20ABI,
  getContractAddress,
  type Pool,
  type UserStake,
  type UserStats,
  type CreatorStats,
  formatCUSD,
  parseCUSD,
  ACTIVE_CHAIN_ID
} from "@/lib/contracts"
import { activeChain } from "@/lib/wagmi-config"

// ============ Pool Contract Hooks ============

export function usePool(poolId: bigint | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "getPool",
    args: poolId !== undefined ? [poolId] : undefined,
    query: {
      enabled: poolId !== undefined,
    },
  })
}

export function usePoolCounter() {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "poolCounter",
  })
}

export function useUserStake(poolId: bigint | undefined, user: `0x${string}` | undefined, choice: number) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "getUserStake",
    args: poolId !== undefined && user ? [poolId, user, choice] : undefined,
    query: {
      enabled: poolId !== undefined && !!user,
    },
  })
}

export function useChoiceTotal(poolId: bigint | undefined, choice: number) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "getChoiceTotal",
    args: poolId !== undefined ? [poolId, choice] : undefined,
    query: {
      enabled: poolId !== undefined,
    },
  })
}

export function useCalculateReward(poolId: bigint | undefined, user: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "calculateReward",
    args: poolId !== undefined && user ? [poolId, user] : undefined,
    query: {
      enabled: poolId !== undefined && !!user,
    },
  })
}

export function useHasUserStaked(poolId: bigint | undefined, user: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "hasUserStaked",
    args: poolId !== undefined && user ? [poolId, user] : undefined,
    query: {
      enabled: poolId !== undefined && !!user,
    },
  })
}

export function usePoolParticipants(poolId: bigint | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_POOL"),
    abi: PicoPrizePoolABI,
    functionName: "getPoolParticipants",
    args: poolId !== undefined ? [poolId] : undefined,
    query: {
      enabled: poolId !== undefined,
    },
  })
}

// ============ Pool Write Hooks ============

export function useCreatePool() {
  const chainId = useChainId()
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const createPool = async (params: {
    poolId: bigint
    metadataUri: string
    choicesCount: number
    deadline: bigint
    minStake: bigint
    maxStake: bigint
    creatorSeed: bigint
    creatorFeeBps: bigint
  }) => {
    // Ensure we're on the correct chain
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    return writeContractAsync({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "createPool",
      args: [
        params.poolId,
        params.metadataUri,
        params.choicesCount,
        params.deadline,
        params.minStake,
        params.maxStake,
        params.creatorSeed,
        params.creatorFeeBps,
      ],
      chainId: activeChain.id,
    })
  }

  return { createPool, hash, isPending, isConfirming, isSuccess, error }
}

export function useStake() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const stake = async (poolId: bigint, choice: number, amount: bigint) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "stake",
      args: [poolId, choice, amount],
      chainId: activeChain.id,
    })
  }

  return { stake, hash, isPending, isConfirming, isSuccess, error }
}

export function useResolvePool() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const resolvePool = async (poolId: bigint, winningChoice: number) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "resolvePool",
      args: [poolId, winningChoice],
      chainId: activeChain.id,
    })
  }

  return { resolvePool, hash, isPending, isConfirming, isSuccess, error }
}

export function useCancelPool() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const cancelPool = async (poolId: bigint, reason: string) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "cancelPool",
      args: [poolId, reason],
      chainId: activeChain.id,
    })
  }

  return { cancelPool, hash, isPending, isConfirming, isSuccess, error }
}

export function useClaimReward() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimReward = async (poolId: bigint) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "claimReward",
      args: [poolId],
      chainId: activeChain.id,
    })
  }

  return { claimReward, hash, isPending, isConfirming, isSuccess, error }
}

export function useClaimRefund() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimRefund = async (poolId: bigint) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "claimRefund",
      args: [poolId],
      chainId: activeChain.id,
    })
  }

  return { claimRefund, hash, isPending, isConfirming, isSuccess, error }
}

// ============ cUSD Token Hooks ============

export function useCUSDBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("CUSD"),
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  })
}

export function useCUSDAllowance(owner: `0x${string}` | undefined, spender: `0x${string}`) {
  return useReadContract({
    address: getContractAddress("CUSD"),
    abi: ERC20ABI,
    functionName: "allowance",
    args: owner ? [owner, spender] : undefined,
    query: {
      enabled: !!owner,
      refetchInterval: 5000,
    },
  })
}

export function useCUSDApprove() {
  const chainId = useChainId()
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const approve = async (spender: `0x${string}`, amount: bigint) => {
    // Ensure we're on the correct chain
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    return writeContractAsync({
      address: getContractAddress("CUSD"),
      abi: ERC20ABI,
      functionName: "approve",
      args: [spender, amount],
      chainId: activeChain.id,
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error }
}

// ============ Reputation Contract Hooks ============

export function useUserStats(user: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "getUserStats",
    args: user ? [user] : undefined,
    query: {
      enabled: !!user,
    },
  })
}

export function useCreatorStats(creator: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "getCreatorStats",
    args: creator ? [creator] : undefined,
    query: {
      enabled: !!creator,
    },
  })
}

export function useLeaderboard(count: number = 10) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "getLeaderboard",
    args: [BigInt(count)],
  })
}

// Hook to fetch all creators from pools and their stats
export function useCreatorsLeaderboard() {
  const { data: poolCounter } = usePoolCounter()
  const totalPools = poolCounter ? Number(poolCounter) : 0

  // Fetch all pools to get creator addresses
  const poolIds = useMemo(() => {
    if (totalPools === 0) return []
    return Array.from({ length: Math.min(totalPools, 100) }, (_, i) => BigInt(i + 1))
  }, [totalPools])
  
  const { data: poolsData, isLoading: isPoolsLoading } = useReadContracts({
    contracts: poolIds.map(id => ({
      address: getContractAddress("PICOPRIZE_POOL"),
      abi: PicoPrizePoolABI,
      functionName: "getPool",
      args: [id],
    })),
    query: {
      enabled: poolIds.length > 0,
    },
  })

  // Extract unique creator addresses
  const creatorAddresses = useMemo(() => {
    if (!poolsData) return []
    const creators = new Set<`0x${string}`>()
    for (const poolResult of poolsData) {
      if (poolResult.status === "success" && poolResult.result) {
        const pool = poolResult.result as unknown as Pool
        if (pool.createdAt !== 0n && pool.creator) {
          creators.add(pool.creator as `0x${string}`)
        }
      }
    }
    return Array.from(creators)
  }, [poolsData])

  // Fetch stats for all creators
  const { data: creatorStatsData, isLoading: isStatsLoading } = useReadContracts({
    contracts: creatorAddresses.map(creator => ({
      address: getContractAddress("PICOPRIZE_REPUTATION"),
      abi: PicoPrizeReputationABI,
      functionName: "getCreatorStats",
      args: [creator],
    })),
    query: {
      enabled: creatorAddresses.length > 0,
    },
  })

  // Process and sort creators
  const creators = useMemo(() => {
    if (!creatorStatsData || !creatorAddresses.length) return []
    
    const creatorsList = creatorAddresses
      .map((address, index) => {
        const statsResult = creatorStatsData[index]
        if (statsResult.status !== "success" || !statsResult.result) return null
        
        const stats = statsResult.result as unknown as CreatorStats
        return {
          address,
          stats,
        }
      })
      .filter((c): c is { address: `0x${string}`; stats: CreatorStats } => c !== null)
      .filter(c => Number(c.stats.lessonsCreated) > 0) // Only show creators with at least 1 lesson
      .sort((a, b) => {
        // Sort by total fees earned (descending), then by lessons created
        const earningsA = Number(a.stats.totalFeesEarned)
        const earningsB = Number(b.stats.totalFeesEarned)
        if (earningsA !== earningsB) return earningsB - earningsA
        return Number(b.stats.lessonsCreated) - Number(a.stats.lessonsCreated)
      })

    return creatorsList
  }, [creatorStatsData, creatorAddresses])

  const isLoading = isPoolsLoading || isStatsLoading || !poolCounter

  return {
    creators,
    isLoading,
  }
}

export function useUserAchievements(user: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "getUserAchievements",
    args: user ? [user] : undefined,
    query: {
      enabled: !!user,
    },
  })
}

export function useIsRegistered(user: `0x${string}` | undefined) {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "isRegistered",
    args: user ? [user] : undefined,
    query: {
      enabled: !!user,
    },
  })
}

export function useTotalUsers() {
  return useReadContract({
    address: getContractAddress("PICOPRIZE_REPUTATION"),
    abi: PicoPrizeReputationABI,
    functionName: "getTotalUsers",
  })
}

export function useRateCreator() {
  const chainId = useChainId()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const rateCreator = async (creator: `0x${string}`, rating: number) => {
    if (chainId !== activeChain.id) {
      throw new Error(`Please switch to ${activeChain.name} (Chain ID: ${activeChain.id}). Current chain: ${chainId}`)
    }

    writeContract({
      address: getContractAddress("PICOPRIZE_REPUTATION"),
      abi: PicoPrizeReputationABI,
      functionName: "rateCreator",
      args: [creator, BigInt(rating)],
      chainId: activeChain.id,
    })
  }

  return { rateCreator, hash, isPending, isConfirming, isSuccess, error }
}

