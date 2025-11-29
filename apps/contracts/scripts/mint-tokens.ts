import hre from "hardhat";
import { parseEther, getAddress } from "viem";

/**
 * Script to mint mock cUSD tokens to a wallet address
 * Usage: npx hardhat run scripts/mint-tokens.ts --network sepolia
 */
async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  // Get the mock cUSD token address from .env or use the deployed address
  const cUsdAddress = process.env.CUSD_ADDRESS as `0x${string}`;
  
  if (!cUsdAddress) {
    throw new Error("CUSD_ADDRESS not found in .env file");
  }

  console.log("🔍 Mock cUSD Token Address:", cUsdAddress);
  console.log("👤 Deployer Address:", deployer.account.address);

  // Get the token contract
  const mockToken = await hre.viem.getContractAt("MockERC20", cUsdAddress);

  // Read token info
  const name = await mockToken.read.name();
  const symbol = await mockToken.read.symbol();
  const decimals = await mockToken.read.decimals();
  
  console.log(`\n📋 Token Info:`);
  console.log(`   Name: ${name}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Decimals: ${decimals}`);

  const recipientsEnv = process.env.MINT_TO || "0x45D4ecCD40A965c7B60B00487D1c65Cb9A197591";
  const recipients = recipientsEnv
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean) as `0x${string}`[];
  const normalizedRecipients = recipients.map((address) => {
    try {
      return getAddress(address);
    } catch (err) {
      throw new Error(`Invalid recipient address provided: ${address}`);
    }
  });

  if (recipients.length === 0) {
    throw new Error("No recipient addresses provided. Set MINT_TO env variable.");
  }

  const mintAmount = parseEther(process.env.MINT_AMOUNT || "1000");
  
  for (const recipientAddress of normalizedRecipients) {
    console.log(`\n====================================`);
    console.log(`💰 Minting ${mintAmount.toString()} ${symbol}`);
    console.log(`   To: ${recipientAddress}`);

    const balanceBefore = await mockToken.read.balanceOf([recipientAddress]);
    console.log(`📊 Balance Before: ${balanceBefore.toString()} ${symbol}`);

    console.log(`⏳ Minting tokens...`);
    const tx = await mockToken.write.mint([recipientAddress, mintAmount]);
    console.log(`   Transaction Hash: ${tx}`);
    console.log(`   Waiting for confirmation...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

    if (receipt.status === "reverted") {
      throw new Error(`Transaction reverted! Hash: ${tx}`);
    }

    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const balanceAfter = await mockToken.read.balanceOf([recipientAddress]);
    const mintedAmount = BigInt(balanceAfter) - BigInt(balanceBefore);

    console.log(`✅ Balance After: ${balanceAfter.toString()} ${symbol}`);
    console.log(`   Minted: ${mintedAmount.toString()} ${symbol}`);

    if (mintedAmount === 0n) {
      console.log(`⚠️  WARNING: No tokens were minted for ${recipientAddress}`);
      console.log(`   Please inspect tx: ${tx}`);
    } else {
      console.log(`🎉 Success! Tokens minted to ${recipientAddress}`);
    }
  }

  console.log(`\n📝 Next Steps:`);
  console.log(`   • Refresh the dApp to see balances update.`);
  console.log(`   • Wallets now have fresh cUSD for staking.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

