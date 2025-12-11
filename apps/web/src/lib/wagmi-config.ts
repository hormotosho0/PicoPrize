"use client"

import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { http } from "wagmi"

// Celo Mainnet chain configuration
const celoMainnet = {
  id: 42220,
  name: "Celo",
  network: "celo",
  nativeCurrency: {
    decimals: 18,
    name: "CELO",
    symbol: "CELO",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_CELO_RPC || "https://forno.celo.org"],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_CELO_RPC || "https://forno.celo.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Celo Explorer",
      url: "https://celoscan.io",
    },
  },
  testnet: false,
} as const

// Celo Sepolia chain configuration (for testnet)
const celoSepolia = {
  id: 11142220,
  name: "Celo Sepolia",
  network: "celo-sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "CELO",
    symbol: "CELO",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_CELO_RPC || "https://sepolia-forno.celo-testnet.org"],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_CELO_RPC || "https://sepolia-forno.celo-testnet.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Celo Explorer",
      url: "https://celo-sepolia.blockscout.com",
    },
  },
  testnet: true,
} as const

// Determine which chain to use based on environment variable
// Default to mainnet if NEXT_PUBLIC_NETWORK is not set
const isMainnet = process.env.NEXT_PUBLIC_NETWORK !== "sepolia"
const activeChain = isMainnet ? celoMainnet : celoSepolia

// getDefaultConfig automatically handles localStorage persistence
// No need to explicitly configure storage - it's handled internally
export const config = getDefaultConfig({
  appName: "PicoPrize",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [activeChain],
  transports: {
    [activeChain.id]: http(
      isMainnet 
        ? (process.env.NEXT_PUBLIC_CELO_RPC || "https://forno.celo.org")
        : (process.env.NEXT_PUBLIC_CELO_RPC || "https://sepolia-forno.celo-testnet.org")
    ),
  },
  ssr: true,
})

export { celoMainnet, celoSepolia, activeChain }

