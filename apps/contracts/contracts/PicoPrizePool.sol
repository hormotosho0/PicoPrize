// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IPicoPrize.sol";
import "./interfaces/IPicoPrizeReputation.sol";

/**
 * @title PicoPrizePool
 * @author PicoPrize Team
 * @notice Main contract for microlearning reward pools with stakeable challenges
 * @dev Implements secure staking, resolution, and payout mechanisms for educational challenges
 * 
 * Security Features:
 * - ReentrancyGuard on all state-changing functions
 * - SafeERC20 for all token transfers
 * - AccessControl for role-based permissions
 * - Pausable for emergency stops
 * - Input validation on all parameters
 * - Overflow protection via Solidity 0.8+
 */
contract PicoPrizePool is IPicoPrize, ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    uint256 public constant MAX_FEE_BPS = 1000; // 10% max fee
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_DEADLINE_BUFFER = 1 hours;
    uint256 public constant MAX_CHOICES = 10;
    uint256 public constant MIN_STAKE_AMOUNT = 1e15; // 0.001 cUSD minimum

    // ============ State Variables ============
    
    /// @notice The ERC20 token used for staking (cUSD)
    IERC20 public immutable stakingToken;
    
    /// @notice Platform treasury address for fee collection
    address public treasury;

    /// @notice Reputation contract for tracking user points and stats
    IPicoPrizeReputation public reputation;
    
    /// @notice Platform fee in basis points (e.g., 200 = 2%)
    uint256 public platformFeeBps;
    
    /// @notice Counter for pool IDs
    uint256 public poolCounter;
    
    /// @notice Mapping of pool ID to Pool struct
    mapping(uint256 => Pool) private _pools;
    
    /// @notice Mapping of poolId => choice => total staked
    mapping(uint256 => mapping(uint8 => uint256)) private _choiceTotals;
    
    /// @notice Mapping of poolId => user => choice => UserStake
    mapping(uint256 => mapping(address => mapping(uint8 => UserStake))) private _userStakes;
    
    /// @notice Mapping of poolId => list of participants
    mapping(uint256 => address[]) private _poolParticipants;
    
    /// @notice Mapping to track if user has staked in pool
    mapping(uint256 => mapping(address => bool)) private _hasStaked;
    
    /// @notice Mapping of poolId => user => total refunded
    mapping(uint256 => mapping(address => uint256)) private _refundedAmounts;

    // ============ Constructor ============
    
    /**
     * @notice Initializes the PicoPrize pool contract
     * @param _stakingToken Address of the ERC20 token (cUSD) for staking
     * @param _treasury Address to receive platform fees
     * @param _platformFeeBps Platform fee in basis points
     * @param _reputation Address of the PicoPrizeReputation contract
     */
    constructor(
        address _stakingToken,
        address _treasury,
        uint256 _platformFeeBps,
        address _reputation
    ) {
        require(_stakingToken != address(0), "Invalid token address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_platformFeeBps <= MAX_FEE_BPS, "Fee too high");
        require(_reputation != address(0), "Invalid reputation address");
        
        stakingToken = IERC20(_stakingToken);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
        reputation = IPicoPrizeReputation(_reputation);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(RESOLVER_ROLE, msg.sender);
    }

    // ============ External Functions ============
    
    /**
     * @notice Creates a new reward pool for a lesson
     * @param poolId Unique identifier for the pool (should match lesson ID)
     * @param metadataUri IPFS or HTTP URI pointing to pool metadata
     * @param choicesCount Number of answer choices (2-10)
     * @param deadline Unix timestamp when staking closes
     * @param minStake Minimum stake amount in wei
     * @param maxStake Maximum stake amount in wei
     * @param creatorSeed Initial seed amount from creator
     * @param creatorFeeBps Creator's fee in basis points
     */
    function createPool(
        uint256 poolId,
        string calldata metadataUri,
        uint8 choicesCount,
        uint256 deadline,
        uint256 minStake,
        uint256 maxStake,
        uint256 creatorSeed,
        uint256 creatorFeeBps
    ) external override nonReentrant whenNotPaused {
        // Validate inputs
        require(_pools[poolId].createdAt == 0, "Pool already exists");
        require(bytes(metadataUri).length > 0, "Empty metadata URI");
        require(choicesCount >= 2 && choicesCount <= MAX_CHOICES, "Invalid choices count");
        require(deadline > block.timestamp + MIN_DEADLINE_BUFFER, "Deadline too soon");
        require(minStake >= MIN_STAKE_AMOUNT, "Min stake too low");
        require(maxStake >= minStake, "Max stake < min stake");
        require(creatorFeeBps <= MAX_FEE_BPS, "Creator fee too high");
        require(platformFeeBps + creatorFeeBps <= MAX_FEE_BPS, "Total fees too high");
        
        // Create pool
        Pool storage pool = _pools[poolId];
        pool.id = poolId;
        pool.creator = msg.sender;
        pool.metadataUri = metadataUri;
        pool.choicesCount = choicesCount;
        pool.deadline = deadline;
        pool.minStake = minStake;
        pool.maxStake = maxStake;
        pool.creatorSeed = creatorSeed;
        pool.platformFeeBps = platformFeeBps;
        pool.creatorFeeBps = creatorFeeBps;
        pool.status = PoolStatus.Active;
        pool.createdAt = block.timestamp;
        
        poolCounter++;
        
        // Transfer creator seed if provided
        if (creatorSeed > 0) {
            stakingToken.safeTransferFrom(msg.sender, address(this), creatorSeed);
            pool.totalStaked = creatorSeed;
        }

        // Register creator stats for new lesson in reputation contract
        if (address(reputation) != address(0)) {
            try reputation.updateCreatorStats(
                pool.creator,
                true,
                0,
                0
            ) {} catch {}
        }
        
        emit PoolCreated(
            poolId,
            msg.sender,
            metadataUri,
            choicesCount,
            deadline,
            minStake,
            maxStake,
            creatorSeed
        );
    }

    /**
     * @notice Places a stake on a specific choice in a pool
     * @param poolId The pool to stake in
     * @param choice The answer choice (0-indexed)
     * @param amount The amount to stake in wei
     */
    function stake(
        uint256 poolId,
        uint8 choice,
        uint256 amount
    ) external override nonReentrant whenNotPaused {
        Pool storage pool = _pools[poolId];
        
        // Validate pool state
        require(pool.createdAt > 0, "Pool does not exist");
        require(pool.status == PoolStatus.Active, "Pool not active");
        require(block.timestamp < pool.deadline, "Pool deadline passed");
        require(choice < pool.choicesCount, "Invalid choice");
        require(amount >= pool.minStake, "Below minimum stake");
        require(amount <= pool.maxStake, "Above maximum stake");
        
        // Check user's total stake on this choice doesn't exceed max
        UserStake storage userStake = _userStakes[poolId][msg.sender][choice];
        require(userStake.amount + amount <= pool.maxStake, "Would exceed max stake");
        
        // Transfer tokens
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update state
        userStake.amount += amount;
        _choiceTotals[poolId][choice] += amount;
        pool.totalStaked += amount;
        
        // Track participant
        if (!_hasStaked[poolId][msg.sender]) {
            _hasStaked[poolId][msg.sender] = true;
            _poolParticipants[poolId].push(msg.sender);
        }
        
        emit StakePlaced(poolId, msg.sender, choice, amount);
    }

    /**
     * @notice Resolves a pool with the winning choice
     * @param poolId The pool to resolve
     * @param winningChoice The correct answer (0-indexed)
     */
    function resolvePool(
        uint256 poolId,
        uint8 winningChoice
    ) external override nonReentrant whenNotPaused {
        Pool storage pool = _pools[poolId];
        
        // Validate
        require(pool.createdAt > 0, "Pool does not exist");
        require(pool.status == PoolStatus.Active, "Pool not active");
        require(
            hasRole(RESOLVER_ROLE, msg.sender) || msg.sender == pool.creator,
            "Not authorized to resolve"
        );
        require(winningChoice < pool.choicesCount, "Invalid winning choice");
        
        // Update pool state
        pool.status = PoolStatus.Resolved;
        pool.winningChoice = winningChoice;
        pool.resolvedAt = block.timestamp;
        
        uint256 winningTotal = _choiceTotals[poolId][winningChoice];
        
        // Calculate and distribute fees
        uint256 totalPayout = pool.totalStaked;
        uint256 platformFee = (totalPayout * pool.platformFeeBps) / BPS_DENOMINATOR;
        uint256 creatorFee = (totalPayout * pool.creatorFeeBps) / BPS_DENOMINATOR;
        
        // Transfer fees
        if (platformFee > 0) {
            stakingToken.safeTransfer(treasury, platformFee);
        }
        if (creatorFee > 0) {
            stakingToken.safeTransfer(pool.creator, creatorFee);
        }

        // Update creator stats in reputation contract (if configured)
        if (address(reputation) != address(0)) {
            try reputation.updateCreatorStats(
                pool.creator,
                false,
                _poolParticipants[poolId].length,
                creatorFee
            ) {} catch {}
        }

        // Update user reputation for all participants
        if (address(reputation) != address(0)) {
            address[] memory participants = _poolParticipants[poolId];
            for (uint256 i = 0; i < participants.length; i++) {
                address user = participants[i];

                // Calculate total stake amount across all choices for this user
                uint256 userTotalStake = 0;
                for (uint8 c = 0; c < pool.choicesCount; c++) {
                    userTotalStake += _userStakes[poolId][user][c].amount;
                }

                if (userTotalStake == 0) {
                    continue;
                }

                bool won = _userStakes[poolId][user][winningChoice].amount > 0;
                uint256 winAmount = 0;
                if (won) {
                    // Use existing reward calculation
                    winAmount = calculateReward(poolId, user);
                }

                try reputation.recordChallengeResult(
                    user,
                    won,
                    userTotalStake,
                    winAmount
                ) {} catch {}
            }
        }
        
        emit PoolResolved(
            poolId,
            winningChoice,
            winningTotal,
            totalPayout - platformFee - creatorFee
        );
    }

    /**
     * @notice Cancels a pool and allows refunds
     * @param poolId The pool to cancel
     * @param reason Reason for cancellation
     */
    function cancelPool(
        uint256 poolId,
        string calldata reason
    ) external override nonReentrant {
        Pool storage pool = _pools[poolId];
        
        require(pool.createdAt > 0, "Pool does not exist");
        require(pool.status == PoolStatus.Active, "Pool not active");
        require(
            hasRole(ADMIN_ROLE, msg.sender) || msg.sender == pool.creator,
            "Not authorized to cancel"
        );
        
        pool.status = PoolStatus.Cancelled;
        
        emit PoolCancelled(poolId, reason);
    }

    /**
     * @notice Claims reward for a resolved pool
     * @param poolId The pool to claim from
     */
    function claimReward(uint256 poolId) external override nonReentrant whenNotPaused {
        Pool storage pool = _pools[poolId];
        
        require(pool.status == PoolStatus.Resolved, "Pool not resolved");
        
        uint8 winningChoice = pool.winningChoice;
        UserStake storage userStake = _userStakes[poolId][msg.sender][winningChoice];
        
        require(userStake.amount > 0, "No winning stake");
        require(!userStake.claimed, "Already claimed");
        
        uint256 reward = calculateReward(poolId, msg.sender);
        require(reward > 0, "No reward to claim");
        
        userStake.claimed = true;
        
        stakingToken.safeTransfer(msg.sender, reward);
        
        emit RewardClaimed(poolId, msg.sender, reward);
    }

    /**
     * @notice Claims refund for a cancelled pool
     * @param poolId The pool to claim refund from
     */
    function claimRefund(uint256 poolId) external override nonReentrant {
        Pool storage pool = _pools[poolId];
        
        require(pool.status == PoolStatus.Cancelled, "Pool not cancelled");
        require(_hasStaked[poolId][msg.sender], "No stake to refund");
        require(_refundedAmounts[poolId][msg.sender] == 0, "Already refunded");
        
        // Calculate total user stake across all choices
        uint256 totalRefund = 0;
        for (uint8 i = 0; i < pool.choicesCount; i++) {
            totalRefund += _userStakes[poolId][msg.sender][i].amount;
        }
        
        require(totalRefund > 0, "Nothing to refund");
        
        _refundedAmounts[poolId][msg.sender] = totalRefund;
        
        stakingToken.safeTransfer(msg.sender, totalRefund);
        
        emit StakeRefunded(poolId, msg.sender, totalRefund);
    }

    // ============ View Functions ============
    
    /**
     * @notice Gets pool information
     * @param poolId The pool ID
     * @return Pool struct
     */
    function getPool(uint256 poolId) external view override returns (Pool memory) {
        return _pools[poolId];
    }

    /**
     * @notice Gets user's stake for a specific choice
     * @param poolId The pool ID
     * @param user The user address
     * @param choice The choice index
     * @return UserStake struct
     */
    function getUserStake(
        uint256 poolId,
        address user,
        uint8 choice
    ) external view override returns (UserStake memory) {
        return _userStakes[poolId][user][choice];
    }

    /**
     * @notice Gets total staked on a choice
     * @param poolId The pool ID
     * @param choice The choice index
     * @return Total amount staked
     */
    function getChoiceTotal(
        uint256 poolId,
        uint8 choice
    ) external view override returns (uint256) {
        return _choiceTotals[poolId][choice];
    }

    /**
     * @notice Calculates reward for a user
     * @param poolId The pool ID
     * @param user The user address
     * @return Reward amount
     */
    function calculateReward(
        uint256 poolId,
        address user
    ) public view override returns (uint256) {
        Pool storage pool = _pools[poolId];
        
        if (pool.status != PoolStatus.Resolved) {
            return 0;
        }
        
        uint8 winningChoice = pool.winningChoice;
        uint256 userWinningStake = _userStakes[poolId][user][winningChoice].amount;
        
        if (userWinningStake == 0) {
            return 0;
        }
        
        uint256 winningTotal = _choiceTotals[poolId][winningChoice];
        if (winningTotal == 0) {
            return 0;
        }
        
        // Calculate total payout after fees
        uint256 totalFees = (pool.totalStaked * (pool.platformFeeBps + pool.creatorFeeBps)) / BPS_DENOMINATOR;
        uint256 payoutPool = pool.totalStaked - totalFees;
        
        // Pro-rata distribution
        return (userWinningStake * payoutPool) / winningTotal;
    }

    /**
     * @notice Gets all participants in a pool
     * @param poolId The pool ID
     * @return Array of participant addresses
     */
    function getPoolParticipants(uint256 poolId) external view returns (address[] memory) {
        return _poolParticipants[poolId];
    }

    /**
     * @notice Gets user's total stake across all choices in a pool
     * @param poolId The pool ID
     * @param user The user address
     * @return Total staked amount
     */
    function getUserTotalStake(uint256 poolId, address user) external view returns (uint256) {
        Pool storage pool = _pools[poolId];
        uint256 total = 0;
        for (uint8 i = 0; i < pool.choicesCount; i++) {
            total += _userStakes[poolId][user][i].amount;
        }
        return total;
    }

    /**
     * @notice Checks if user has staked in a pool
     * @param poolId The pool ID
     * @param user The user address
     * @return True if user has staked
     */
    function hasUserStaked(uint256 poolId, address user) external view returns (bool) {
        return _hasStaked[poolId][user];
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Updates platform fee
     * @param newFeeBps New fee in basis points
     */
    function setPlatformFee(uint256 newFeeBps) external onlyRole(ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFee = platformFeeBps;
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(oldFee, newFeeBps);
    }

    /**
     * @notice Updates treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid address");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Grants resolver role to an address
     * @param resolver Address to grant role
     */
    function addResolver(address resolver) external onlyRole(ADMIN_ROLE) {
        grantRole(RESOLVER_ROLE, resolver);
        emit ResolverUpdated(resolver, true);
    }

    /**
     * @notice Revokes resolver role from an address
     * @param resolver Address to revoke role
     */
    function removeResolver(address resolver) external onlyRole(ADMIN_ROLE) {
        revokeRole(RESOLVER_ROLE, resolver);
        emit ResolverUpdated(resolver, false);
    }

    /**
     * @notice Pauses the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Emergency withdrawal of stuck tokens
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(stakingToken), "Cannot withdraw staking token");
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}

