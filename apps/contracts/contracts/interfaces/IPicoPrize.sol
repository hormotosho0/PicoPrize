// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPicoPrize
 * @notice Interface for the PicoPrize reward pool system
 * @dev Defines all events and external functions for the reward pool
 */
interface IPicoPrize {
    // ============ Enums ============
    
    enum PoolStatus {
        Active,      // Pool is accepting stakes
        Closed,      // Pool is closed for staking, awaiting resolution
        Resolved,    // Pool has been resolved, rewards can be claimed
        Cancelled    // Pool was cancelled, stakes can be refunded
    }

    // ============ Structs ============
    
    struct Pool {
        uint256 id;
        address creator;
        string metadataUri;
        uint8 choicesCount;
        uint256 deadline;
        uint256 minStake;
        uint256 maxStake;
        uint256 creatorSeed;
        uint256 platformFeeBps;
        uint256 creatorFeeBps;
        uint256 totalStaked;
        uint8 winningChoice;
        PoolStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
    }

    struct UserStake {
        uint256 amount;
        bool claimed;
    }

    // ============ Events ============
    
    event PoolCreated(
        uint256 indexed poolId,
        address indexed creator,
        string metadataUri,
        uint8 choicesCount,
        uint256 deadline,
        uint256 minStake,
        uint256 maxStake,
        uint256 creatorSeed
    );

    event StakePlaced(
        uint256 indexed poolId,
        address indexed user,
        uint8 indexed choice,
        uint256 amount
    );

    event PoolResolved(
        uint256 indexed poolId,
        uint8 winningChoice,
        uint256 totalWinningStake,
        uint256 totalPayout
    );

    event PoolCancelled(
        uint256 indexed poolId,
        string reason
    );

    event RewardClaimed(
        uint256 indexed poolId,
        address indexed user,
        uint256 amount
    );

    event StakeRefunded(
        uint256 indexed poolId,
        address indexed user,
        uint256 amount
    );

    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event ResolverUpdated(address resolver, bool status);

    // ============ External Functions ============
    
    function createPool(
        uint256 poolId,
        string calldata metadataUri,
        uint8 choicesCount,
        uint256 deadline,
        uint256 minStake,
        uint256 maxStake,
        uint256 creatorSeed,
        uint256 creatorFeeBps
    ) external;

    function stake(uint256 poolId, uint8 choice, uint256 amount) external;
    
    function resolvePool(uint256 poolId, uint8 winningChoice) external;
    
    function cancelPool(uint256 poolId, string calldata reason) external;
    
    function claimReward(uint256 poolId) external;
    
    function claimRefund(uint256 poolId) external;
    
    function getPool(uint256 poolId) external view returns (Pool memory);
    
    function getUserStake(uint256 poolId, address user, uint8 choice) external view returns (UserStake memory);
    
    function getChoiceTotal(uint256 poolId, uint8 choice) external view returns (uint256);
    
    function calculateReward(uint256 poolId, address user) external view returns (uint256);
}

