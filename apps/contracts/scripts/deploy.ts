import hre from "hardhat";
import { parseEther } from "viem";

// Celo Sepolia cUSD address
const CUSD_SEPOLIA = "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1";

// Celo Mainnet cUSD address (for reference)
const CUSD_MAINNET = "0x765DE816845861e75A25fCA122bb6898B8B1282a";

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  console.log("Deploying contracts with account:", deployer.account.address);

  const balance = await publicClient.getBalance({
    address: deployer.account.address,
  });
  console.log("Account balance:", balance.toString());

  // Determine which cUSD address to use based on network
  const networkName = hre.network.name;
  const chainId = await publicClient.getChainId();
  let cUsdAddress: `0x${string}`;
  
  // Celo Sepolia (chain ID 11142220) doesn't have cUSD deployed
  // So we always deploy a mock token for it
  if (networkName === "celo" && chainId !== 11142220) {
    // Celo Mainnet
    cUsdAddress = CUSD_MAINNET;
    console.log("Using mainnet cUSD address:", cUsdAddress);
  } else if (networkName === "alfajores" || chainId === 44787) {
    // Celo Alfajores testnet
    cUsdAddress = CUSD_SEPOLIA;
    console.log("Using Alfajores cUSD address:", cUsdAddress);
  } else {
    // For Celo Sepolia or local testing, deploy a mock token
    console.log("⚠️  cUSD not available on this network. Deploying mock cUSD token...");
    const mockToken = await hre.viem.deployContract("MockERC20", [
      "Mock cUSD",
      "cUSD",
      18n,
    ]);
    cUsdAddress = mockToken.address;
    console.log("✅ Mock cUSD deployed to:", cUsdAddress);
    console.log("📝 Add this to your .env.local: NEXT_PUBLIC_CUSD_ADDRESS=" + cUsdAddress);
  }

  // Treasury address (use deployer for now, change in production)
  const treasuryAddress = deployer.account.address;
  
  // Platform fee: 2% (200 basis points)
  const platformFeeBps = 200n;

  console.log("\n--- Deploying PicoPrizeReputation ---");
  const picoPrizeReputation = await hre.viem.deployContract("PicoPrizeReputation", []);
  console.log("PicoPrizeReputation deployed to:", picoPrizeReputation.address);

  console.log("\n--- Deploying PicoPrizePool ---");
  const picoPrizePool = await hre.viem.deployContract("PicoPrizePool", [
    cUsdAddress,
    treasuryAddress,
    platformFeeBps,
    picoPrizeReputation.address,
  ]);
  console.log("PicoPrizePool deployed to:", picoPrizePool.address);

  console.log("\n--- Deploying PicoPrizeCommitReveal ---");
  const picoPrizeCommitReveal = await hre.viem.deployContract("PicoPrizeCommitReveal", [
    cUsdAddress,
    treasuryAddress,
    platformFeeBps,
  ]);
  console.log("PicoPrizeCommitReveal deployed to:", picoPrizeCommitReveal.address);

  // Grant UPDATER_ROLE to PicoPrizePool on Reputation contract
  console.log("\n--- Setting up roles ---");
  const UPDATER_ROLE = await picoPrizeReputation.read.UPDATER_ROLE();
  await picoPrizeReputation.write.grantRole([UPDATER_ROLE, picoPrizePool.address]);
  console.log("Granted UPDATER_ROLE to PicoPrizePool");

  await picoPrizeReputation.write.grantRole([UPDATER_ROLE, picoPrizeCommitReveal.address]);
  console.log("Granted UPDATER_ROLE to PicoPrizeCommitReveal");

  console.log("\n========================================");
  console.log("Deployment Summary:");
  console.log("========================================");
  console.log("Network:", networkName);
  console.log("cUSD Address:", cUsdAddress);
  console.log("Treasury:", treasuryAddress);
  console.log("Platform Fee:", Number(platformFeeBps) / 100, "%");
  console.log("");
  console.log("Contract Addresses:");
  console.log("  PicoPrizePool:", picoPrizePool.address);
  console.log("  PicoPrizeCommitReveal:", picoPrizeCommitReveal.address);
  console.log("  PicoPrizeReputation:", picoPrizeReputation.address);
  console.log("========================================");

  // Save deployment addresses to a file
  const fs = await import("fs");
  const deploymentInfo = {
    network: networkName,
    timestamp: new Date().toISOString(),
    contracts: {
      PicoPrizePool: picoPrizePool.address,
      PicoPrizeCommitReveal: picoPrizeCommitReveal.address,
      PicoPrizeReputation: picoPrizeReputation.address,
    },
    config: {
      cUsdAddress,
      treasuryAddress,
      platformFeeBps: platformFeeBps.toString(),
    },
  };

  fs.writeFileSync(
    `deployments/${networkName}-${Date.now()}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployments/");

  // Verify contracts on block explorer (if not local)
  if (networkName !== "localhost" && networkName !== "hardhat") {
    console.log("\n--- Verifying contracts on block explorer ---");
    try {
      await hre.run("verify:verify", {
        address: picoPrizePool.address,
        constructorArguments: [cUsdAddress, treasuryAddress, platformFeeBps],
      });
      console.log("PicoPrizePool verified");
    } catch (e) {
      console.log("PicoPrizePool verification failed:", e);
    }

    try {
      await hre.run("verify:verify", {
        address: picoPrizeCommitReveal.address,
        constructorArguments: [cUsdAddress, treasuryAddress, platformFeeBps],
      });
      console.log("PicoPrizeCommitReveal verified");
    } catch (e) {
      console.log("PicoPrizeCommitReveal verification failed:", e);
    }

    try {
      await hre.run("verify:verify", {
        address: picoPrizeReputation.address,
        constructorArguments: [],
      });
      console.log("PicoPrizeReputation verified");
    } catch (e) {
      console.log("PicoPrizeReputation verification failed:", e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

