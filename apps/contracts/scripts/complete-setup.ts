import hre from "hardhat";

// Contract addresses from deployment
const REPUTATION_ADDRESS = "0x0c425a37b729ce29ea18571b7d719a2181834af9";
const POOL_ADDRESS = "0x5b78f52ed9c2c81f4972cb035500fcf6cdd97269";
const COMMIT_REVEAL_ADDRESS = "0xad09971591772eec3f2638d15fdf625d76746299";

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  console.log("Completing setup with account:", deployer.account.address);
  console.log("Network:", hre.network.name);

  // Get the reputation contract
  const reputation = await hre.viem.getContractAt(
    "PicoPrizeReputation",
    REPUTATION_ADDRESS
  );

  // Get UPDATER_ROLE
  const UPDATER_ROLE = await reputation.read.UPDATER_ROLE();

  console.log("\n--- Granting roles ---");

  // Check if PicoPrizePool already has the role
  const poolHasRole = await reputation.read.hasRole([UPDATER_ROLE, POOL_ADDRESS]);
  if (!poolHasRole) {
    console.log("Granting UPDATER_ROLE to PicoPrizePool...");
    await reputation.write.grantRole([UPDATER_ROLE, POOL_ADDRESS]);
    console.log("✅ Granted UPDATER_ROLE to PicoPrizePool");
  } else {
    console.log("✅ PicoPrizePool already has UPDATER_ROLE");
  }

  // Check if PicoPrizeCommitReveal already has the role
  const commitRevealHasRole = await reputation.read.hasRole([UPDATER_ROLE, COMMIT_REVEAL_ADDRESS]);
  if (!commitRevealHasRole) {
    console.log("Granting UPDATER_ROLE to PicoPrizeCommitReveal...");
    await reputation.write.grantRole([UPDATER_ROLE, COMMIT_REVEAL_ADDRESS]);
    console.log("✅ Granted UPDATER_ROLE to PicoPrizeCommitReveal");
  } else {
    console.log("✅ PicoPrizeCommitReveal already has UPDATER_ROLE");
  }

  console.log("\n========================================");
  console.log("Setup Complete!");
  console.log("========================================");
  console.log("Contract Addresses:");
  console.log("  PicoPrizePool:", POOL_ADDRESS);
  console.log("  PicoPrizeCommitReveal:", COMMIT_REVEAL_ADDRESS);
  console.log("  PicoPrizeReputation:", REPUTATION_ADDRESS);
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

