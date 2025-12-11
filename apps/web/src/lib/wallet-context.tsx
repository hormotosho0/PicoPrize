"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useAccount, useBalance, useDisconnect, useChainId, useReadContract } from "wagmi"
import { RainbowKitProvider, ConnectButton, darkTheme } from "@rainbow-me/rainbowkit"
import "@rainbow-me/rainbowkit/styles.css"
import { config } from "./wagmi-config"
import { getContractAddress, formatCUSD, ERC20ABI } from "./contracts"

// Create query client
const queryClient = new QueryClient()

interface WalletContextType {
  address: `0x${string}` | null
  balance: string | null
  balanceRaw: bigint | null
  isConnected: boolean
  isConnecting: boolean
  chainId: number | null
  isCorrectNetwork: boolean
  disconnect: () => void
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

function WalletContextInner({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting, isReconnecting, status } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  
  // Fetch cUSD balance using useBalance hook
  const { data: cUSDBalance, error: balanceError, isLoading: isBalanceLoading } = useBalance({
    address: address,
    token: getContractAddress("CUSD"),
    query: {
      enabled: !!address && (chainId === 42220 || chainId === 11142220), // Support both mainnet and testnet
      refetchInterval: 10000, // Refetch every 10 seconds
      retry: 3,
    },
  })

  // Fallback: Direct contract call - ALWAYS try this as primary method
  const { data: directBalance, error: directBalanceError, isLoading: isDirectBalanceLoading } = useReadContract({
    address: getContractAddress("CUSD"),
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && (chainId === 42220 || chainId === 11142220), // Support both mainnet and testnet
      refetchInterval: 10000,
      retry: 1, // Reduce retries since we know it might fail
    },
  })

  // Prioritize direct balance call (more reliable), fallback to useBalance
  const finalBalance = directBalance 
    ? { value: directBalance as bigint, decimals: 18n, symbol: "cUSD", formatted: formatCUSD(directBalance as bigint) }
    : cUSDBalance || null

  const isCorrectNetwork = chainId === 42220 || chainId === 11142220 // Support both mainnet and testnet

  // Consider connected if: actually connected OR reconnecting (which means restoring from storage)
  // When reconnecting, address will be available, so we should treat it as connected
  const effectiveIsConnected = isConnected || (isReconnecting && !!address)

  // Format balance, handling errors - use finalBalance (with fallback)
  // Check if error is about contract not existing
  const isContractError = directBalanceError?.message?.includes("returned no data") || 
                          directBalanceError?.message?.includes("not a contract") ||
                          directBalanceError?.message?.includes("does not have the function")
  
  const formattedBalance = finalBalance 
    ? formatCUSD(finalBalance.value) 
    : isContractError
      ? `⚠️ Invalid cUSD address: ${getContractAddress("CUSD")}. Please check your .env file.`
      : (directBalanceError || balanceError)
        ? `Error: ${directBalanceError?.message || balanceError?.message || "Failed to fetch balance"}` 
        : (isDirectBalanceLoading || isBalanceLoading)
          ? "Loading..." 
          : "0.00"


  const contextValue: WalletContextType = {
    address: address || null,
    balance: formattedBalance,
    balanceRaw: finalBalance?.value || null,
    isConnected: effectiveIsConnected,
    isConnecting: isConnecting || (isReconnecting && !address), // Show connecting only if reconnecting without address yet
    chainId: chainId || null,
    isCorrectNetwork,
    disconnect,
  }

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  )
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#6C63FF",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
          modalSize="compact"
        >
          {mounted ? (
            <WalletContextInner>{children}</WalletContextInner>
          ) : (
            // Prevent hydration mismatch
            <WalletContext.Provider
              value={{
                address: null,
                balance: null,
                balanceRaw: null,
                isConnected: false,
                isConnecting: false,
                chainId: null,
                isCorrectNetwork: false,
                disconnect: () => {},
              }}
            >
              {children}
            </WalletContext.Provider>
          )}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider")
  }
  return context
}

// Export ConnectButton for use in components
export { ConnectButton }
