import { expect } from "chai";
import hre from "hardhat";
import { parseEther, getAddress } from "viem";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

describe("PicoPrizePool", function () {
  // Fixture to deploy contracts
  async function deployFixture() {
    const [owner, creator, user1, user2, user3, treasury] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    // Deploy mock cUSD
    const mockToken = await hre.viem.deployContract("MockERC20", [
      "Mock cUSD",
      "cUSD",
      18n,
    ]);

    // Deploy PicoPrizePool
    const platformFeeBps = 200n; // 2%
    const pool = await hre.viem.deployContract("PicoPrizePool", [
      mockToken.address,
      treasury.account.address,
      platformFeeBps,
    ]);

    // Mint tokens to users
    const mintAmount = parseEther("1000");
    await mockToken.write.mint([creator.account.address, mintAmount]);
    await mockToken.write.mint([user1.account.address, mintAmount]);
    await mockToken.write.mint([user2.account.address, mintAmount]);
    await mockToken.write.mint([user3.account.address, mintAmount]);

    // Approve pool to spend tokens
    const maxApproval = parseEther("1000000");
    await mockToken.write.approve([pool.address, maxApproval], { account: creator.account });
    await mockToken.write.approve([pool.address, maxApproval], { account: user1.account });
    await mockToken.write.approve([pool.address, maxApproval], { account: user2.account });
    await mockToken.write.approve([pool.address, maxApproval], { account: user3.account });

    return { pool, mockToken, owner, creator, user1, user2, user3, treasury, publicClient };
  }

  describe("Deployment", function () {
    it("Should set the correct staking token", async function () {
      const { pool, mockToken } = await loadFixture(deployFixture);
      expect(await pool.read.stakingToken()).to.equal(getAddress(mockToken.address));
    });

    it("Should set the correct platform fee", async function () {
      const { pool } = await loadFixture(deployFixture);
      expect(await pool.read.platformFeeBps()).to.equal(200n);
    });

    it("Should grant admin role to deployer", async function () {
      const { pool, owner } = await loadFixture(deployFixture);
      const adminRole = await pool.read.ADMIN_ROLE();
      expect(await pool.read.hasRole([adminRole, owner.account.address])).to.be.true;
    });
  });

  describe("Pool Creation", function () {
    it("Should create a pool successfully", async function () {
      const { pool, creator } = await loadFixture(deployFixture);
      
      const poolId = 1n;
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200); // 2 hours from now
      const minStake = parseEther("0.01");
      const maxStake = parseEther("1");
      const creatorSeed = parseEther("10");
      const creatorFeeBps = 100n; // 1%

      await pool.write.createPool([
        poolId,
        "ipfs://metadata",
        4, // 4 choices
        deadline,
        minStake,
        maxStake,
        creatorSeed,
        creatorFeeBps,
      ], { account: creator.account });

      const poolData = await pool.read.getPool([poolId]);
      expect(poolData.id).to.equal(poolId);
      expect(poolData.creator).to.equal(getAddress(creator.account.address));
      expect(poolData.totalStaked).to.equal(creatorSeed);
    });

    it("Should reject pool with deadline too soon", async function () {
      const { pool, creator } = await loadFixture(deployFixture);
      
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 60); // 1 minute (too soon)

      await expect(
        pool.write.createPool([
          1n,
          "ipfs://metadata",
          4,
          deadline,
          parseEther("0.01"),
          parseEther("1"),
          0n,
          100n,
        ], { account: creator.account })
      ).to.be.rejectedWith("Deadline too soon");
    });

    it("Should reject duplicate pool ID", async function () {
      const { pool, creator } = await loadFixture(deployFixture);
      
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200);

      await pool.write.createPool([
        1n,
        "ipfs://metadata",
        4,
        deadline,
        parseEther("0.01"),
        parseEther("1"),
        0n,
        100n,
      ], { account: creator.account });

      await expect(
        pool.write.createPool([
          1n, // Same ID
          "ipfs://metadata2",
          4,
          deadline,
          parseEther("0.01"),
          parseEther("1"),
          0n,
          100n,
        ], { account: creator.account })
      ).to.be.rejectedWith("Pool already exists");
    });
  });

  describe("Staking", function () {
    async function createPoolFixture() {
      const fixture = await loadFixture(deployFixture);
      const { pool, creator } = fixture;

      const poolId = 1n;
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200);

      await pool.write.createPool([
        poolId,
        "ipfs://metadata",
        4,
        deadline,
        parseEther("0.01"),
        parseEther("1"),
        parseEther("10"),
        100n,
      ], { account: creator.account });

      return { ...fixture, poolId, deadline };
    }

    it("Should allow users to stake", async function () {
      const { pool, user1, poolId } = await loadFixture(createPoolFixture);
      
      const stakeAmount = parseEther("0.5");
      await pool.write.stake([poolId, 0, stakeAmount], { account: user1.account });

      const userStake = await pool.read.getUserStake([poolId, user1.account.address, 0]);
      expect(userStake.amount).to.equal(stakeAmount);
    });

    it("Should reject stake below minimum", async function () {
      const { pool, user1, poolId } = await loadFixture(createPoolFixture);
      
      await expect(
        pool.write.stake([poolId, 0, parseEther("0.001")], { account: user1.account })
      ).to.be.rejectedWith("Below minimum stake");
    });

    it("Should reject stake above maximum", async function () {
      const { pool, user1, poolId } = await loadFixture(createPoolFixture);
      
      await expect(
        pool.write.stake([poolId, 0, parseEther("2")], { account: user1.account })
      ).to.be.rejectedWith("Above maximum stake");
    });

    it("Should reject stake with invalid choice", async function () {
      const { pool, user1, poolId } = await loadFixture(createPoolFixture);
      
      await expect(
        pool.write.stake([poolId, 5, parseEther("0.5")], { account: user1.account }) // Only 4 choices (0-3)
      ).to.be.rejectedWith("Invalid choice");
    });

    it("Should track multiple stakes correctly", async function () {
      const { pool, user1, user2, user3, poolId } = await loadFixture(createPoolFixture);
      
      await pool.write.stake([poolId, 0, parseEther("0.5")], { account: user1.account });
      await pool.write.stake([poolId, 1, parseEther("0.3")], { account: user2.account });
      await pool.write.stake([poolId, 0, parseEther("0.2")], { account: user3.account });

      expect(await pool.read.getChoiceTotal([poolId, 0])).to.equal(parseEther("0.7"));
      expect(await pool.read.getChoiceTotal([poolId, 1])).to.equal(parseEther("0.3"));
    });
  });

  describe("Resolution and Rewards", function () {
    async function stakedPoolFixture() {
      const fixture = await loadFixture(deployFixture);
      const { pool, creator, user1, user2, user3 } = fixture;

      const poolId = 1n;
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200);

      await pool.write.createPool([
        poolId,
        "ipfs://metadata",
        4,
        deadline,
        parseEther("0.01"),
        parseEther("10"),
        parseEther("0"), // No seed for cleaner math
        100n, // 1% creator fee
      ], { account: creator.account });

      // Users stake
      await pool.write.stake([poolId, 0, parseEther("1")], { account: user1.account }); // Winner
      await pool.write.stake([poolId, 0, parseEther("1")], { account: user2.account }); // Winner
      await pool.write.stake([poolId, 1, parseEther("2")], { account: user3.account }); // Loser

      return { ...fixture, poolId };
    }

    it("Should resolve pool correctly", async function () {
      const { pool, creator, poolId } = await loadFixture(stakedPoolFixture);
      
      await pool.write.resolvePool([poolId, 0], { account: creator.account });

      const poolData = await pool.read.getPool([poolId]);
      expect(poolData.status).to.equal(2); // Resolved
      expect(poolData.winningChoice).to.equal(0);
    });

    it("Should calculate rewards correctly", async function () {
      const { pool, creator, user1, user2, user3, poolId } = await loadFixture(stakedPoolFixture);
      
      await pool.write.resolvePool([poolId, 0], { account: creator.account });

      // Total staked: 4 ETH
      // Platform fee (2%): 0.08 ETH
      // Creator fee (1%): 0.04 ETH
      // Payout pool: 3.88 ETH
      // Winners (user1 + user2) split 3.88 ETH 50/50 = 1.94 ETH each

      const reward1 = await pool.read.calculateReward([poolId, user1.account.address]);
      const reward2 = await pool.read.calculateReward([poolId, user2.account.address]);
      const reward3 = await pool.read.calculateReward([poolId, user3.account.address]);

      expect(reward1).to.equal(parseEther("1.94"));
      expect(reward2).to.equal(parseEther("1.94"));
      expect(reward3).to.equal(0n); // Loser gets nothing
    });

    it("Should allow winners to claim rewards", async function () {
      const { pool, mockToken, creator, user1, poolId } = await loadFixture(stakedPoolFixture);
      
      await pool.write.resolvePool([poolId, 0], { account: creator.account });

      const balanceBefore = await mockToken.read.balanceOf([user1.account.address]);
      await pool.write.claimReward([poolId], { account: user1.account });
      const balanceAfter = await mockToken.read.balanceOf([user1.account.address]);

      expect(balanceAfter - balanceBefore).to.equal(parseEther("1.94"));
    });

    it("Should prevent double claiming", async function () {
      const { pool, creator, user1, poolId } = await loadFixture(stakedPoolFixture);
      
      await pool.write.resolvePool([poolId, 0], { account: creator.account });
      await pool.write.claimReward([poolId], { account: user1.account });

      await expect(
        pool.write.claimReward([poolId], { account: user1.account })
      ).to.be.rejectedWith("Already claimed");
    });
  });

  describe("Pool Cancellation", function () {
    it("Should allow creator to cancel pool", async function () {
      const { pool, creator, user1 } = await loadFixture(deployFixture);
      
      const poolId = 1n;
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200);

      await pool.write.createPool([
        poolId,
        "ipfs://metadata",
        4,
        deadline,
        parseEther("0.01"),
        parseEther("1"),
        0n,
        100n,
      ], { account: creator.account });

      await pool.write.stake([poolId, 0, parseEther("0.5")], { account: user1.account });

      await pool.write.cancelPool([poolId, "Test cancellation"], { account: creator.account });

      const poolData = await pool.read.getPool([poolId]);
      expect(poolData.status).to.equal(3); // Cancelled
    });

    it("Should allow refunds after cancellation", async function () {
      const { pool, mockToken, creator, user1 } = await loadFixture(deployFixture);
      
      const poolId = 1n;
      const currentTime = await time.latest();
      const deadline = BigInt(currentTime + 7200);

      await pool.write.createPool([
        poolId,
        "ipfs://metadata",
        4,
        deadline,
        parseEther("0.01"),
        parseEther("1"),
        0n,
        100n,
      ], { account: creator.account });

      const stakeAmount = parseEther("0.5");
      await pool.write.stake([poolId, 0, stakeAmount], { account: user1.account });

      await pool.write.cancelPool([poolId, "Test"], { account: creator.account });

      const balanceBefore = await mockToken.read.balanceOf([user1.account.address]);
      await pool.write.claimRefund([poolId], { account: user1.account });
      const balanceAfter = await mockToken.read.balanceOf([user1.account.address]);

      expect(balanceAfter - balanceBefore).to.equal(stakeAmount);
    });
  });

  describe("Access Control", function () {
    it("Should only allow admin to pause", async function () {
      const { pool, user1 } = await loadFixture(deployFixture);
      
      await expect(
        pool.write.pause({ account: user1.account })
      ).to.be.rejected;
    });

    it("Should only allow admin to set platform fee", async function () {
      const { pool, user1 } = await loadFixture(deployFixture);
      
      await expect(
        pool.write.setPlatformFee([300n], { account: user1.account })
      ).to.be.rejected;
    });
  });
});
