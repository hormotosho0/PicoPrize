// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PicoPrizeCommitReveal
 * @author PicoPrize Team
 * @notice Commit-reveal scheme for prediction challenges to prevent front-running
 * @dev Implements a secure two-phase commit-reveal mechanism for fair predictions
 * 
 * Flow:
 * 1. Commit Phase: Users submit hash(choice + salt + address) with stake
 * 2. Reveal Phase: Users reveal their choice and salt
 * 3. Finalize: Admin/system determines winner and distributes rewards
 * 
 * Security Features:
 * - Prevents front-running by hiding choices until reveal
 * - Time-locked phases prevent manipulation
 * - Salt prevents rainbow table attacks
 * - Address included in hash prevents commit copying
 */
contract PicoPrizeCommitReveal is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    
    uint256 public constant MIN_COMMIT_DURATION = 1 hours;
    uint256 public constant MIN_REVEAL_DURATION = 30 minutes;
    uint256 public constant MAX_FEE_BPS = 1000;
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Enums ============
    
    enum RoundStatus {
        NotStarted,
        CommitPhase,
        RevealPhase,
        Finalized,
        Cancelled
    }

    // ============ Structs ============
    
    struct Round {
        uint256 id;
        address creator;
        string metadataUri;
        uint8 choicesCount;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 minStake;
        uint256 maxStake;
        uint256 totalCommitted;
        uint256 totalRevealed;
        uint8 winningChoice;
        uint256 platformFeeBps;
        uint256 creatorFeeBps;
        RoundStatus status;
        uint256 createdAt;
    }

    struct Commitment {
        bytes32 commitHash;
        uint256 stakeAmount;
        uint8 revealedChoice;
        bool revealed;
        bool claimed;
    }

    // ============ Events ============
    
    event RoundCreated(
        uint256 indexed roundId,
        address indexed creator,
        uint256 commitDeadline,
        uint256 revealDeadline,
        uint8 choicesCount
    );

    event CommitmentMade(
        uint256 indexed roundId,
        address indexed user,
        bytes32 commitHash,
        uint256 stakeAmount
    );

    event ChoiceRevealed(
        uint256 indexed roundId,
        address indexed user,
        uint8 choice
    );

    event RoundFinalized(
        uint256 indexed roundId,
        uint8 winningChoice,
        uint256 totalPayout
    );

    event RoundCancelled(
        uint256 indexed roundId,
        string reason
    );

    event RewardClaimed(
        uint256 indexed roundId,
        address indexed user,
        uint256 amount
    );

    event RefundClaimed(
        uint256 indexed roundId,
        address indexed user,
        uint256 amount
    );

    // ============ State Variables ============
    
    IERC20 public immutable stakingToken;
    address public treasury;
    uint256 public platformFeeBps;
    uint256 public roundCounter;

    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => mapping(address => Commitment)) private _commitments;
    mapping(uint256 => mapping(uint8 => uint256)) private _choiceTotals;
    mapping(uint256 => address[]) private _roundParticipants;
    mapping(uint256 => mapping(address => bool)) private _hasCommitted;

    // ============ Constructor ============
    
    constructor(
        address _stakingToken,
        address _treasury,
        uint256 _platformFeeBps
    ) {
        require(_stakingToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        require(_platformFeeBps <= MAX_FEE_BPS, "Fee too high");

        stakingToken = IERC20(_stakingToken);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(RESOLVER_ROLE, msg.sender);
    }

    // ============ External Functions ============
    
    /**
     * @notice Creates a new commit-reveal round
     * @param roundId Unique identifier for the round
     * @param metadataUri URI pointing to round metadata
     * @param choicesCount Number of possible choices
     * @param commitDuration Duration of commit phase in seconds
     * @param revealDuration Duration of reveal phase in seconds
     * @param minStake Minimum stake amount
     * @param maxStake Maximum stake amount
     * @param creatorFeeBps Creator fee in basis points
     */
    function createRound(
        uint256 roundId,
        string calldata metadataUri,
        uint8 choicesCount,
        uint256 commitDuration,
        uint256 revealDuration,
        uint256 minStake,
        uint256 maxStake,
        uint256 creatorFeeBps
    ) external nonReentrant whenNotPaused {
        require(_rounds[roundId].createdAt == 0, "Round exists");
        require(choicesCount >= 2 && choicesCount <= 10, "Invalid choices");
        require(commitDuration >= MIN_COMMIT_DURATION, "Commit too short");
        require(revealDuration >= MIN_REVEAL_DURATION, "Reveal too short");
        require(minStake > 0, "Min stake zero");
        require(maxStake >= minStake, "Invalid stake range");
        require(creatorFeeBps + platformFeeBps <= MAX_FEE_BPS, "Fees too high");

        uint256 commitDeadline = block.timestamp + commitDuration;
        uint256 revealDeadline = commitDeadline + revealDuration;

        Round storage round = _rounds[roundId];
        round.id = roundId;
        round.creator = msg.sender;
        round.metadataUri = metadataUri;
        round.choicesCount = choicesCount;
        round.commitDeadline = commitDeadline;
        round.revealDeadline = revealDeadline;
        round.minStake = minStake;
        round.maxStake = maxStake;
        round.platformFeeBps = platformFeeBps;
        round.creatorFeeBps = creatorFeeBps;
        round.status = RoundStatus.CommitPhase;
        round.createdAt = block.timestamp;

        roundCounter++;

        emit RoundCreated(roundId, msg.sender, commitDeadline, revealDeadline, choicesCount);
    }

    /**
     * @notice Commits a hidden choice with stake
     * @param roundId The round ID
     * @param commitHash Hash of (choice, salt, msg.sender)
     * @param stakeAmount Amount to stake
     */
    function commit(
        uint256 roundId,
        bytes32 commitHash,
        uint256 stakeAmount
    ) external nonReentrant whenNotPaused {
        Round storage round = _rounds[roundId];
        
        require(round.createdAt > 0, "Round not found");
        require(round.status == RoundStatus.CommitPhase, "Not commit phase");
        require(block.timestamp < round.commitDeadline, "Commit deadline passed");
        require(!_hasCommitted[roundId][msg.sender], "Already committed");
        require(stakeAmount >= round.minStake, "Below min stake");
        require(stakeAmount <= round.maxStake, "Above max stake");
        require(commitHash != bytes32(0), "Invalid hash");

        stakingToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        _commitments[roundId][msg.sender] = Commitment({
            commitHash: commitHash,
            stakeAmount: stakeAmount,
            revealedChoice: 0,
            revealed: false,
            claimed: false
        });

        _hasCommitted[roundId][msg.sender] = true;
        _roundParticipants[roundId].push(msg.sender);
        round.totalCommitted += stakeAmount;

        emit CommitmentMade(roundId, msg.sender, commitHash, stakeAmount);
    }

    /**
     * @notice Reveals the committed choice
     * @param roundId The round ID
     * @param choice The actual choice (0-indexed)
     * @param salt The salt used in commitment
     */
    function reveal(
        uint256 roundId,
        uint8 choice,
        bytes32 salt
    ) external nonReentrant whenNotPaused {
        Round storage round = _rounds[roundId];
        
        require(round.createdAt > 0, "Round not found");
        require(
            round.status == RoundStatus.CommitPhase && block.timestamp >= round.commitDeadline ||
            round.status == RoundStatus.RevealPhase,
            "Not reveal phase"
        );
        require(block.timestamp < round.revealDeadline, "Reveal deadline passed");
        require(choice < round.choicesCount, "Invalid choice");

        // Update status if needed
        if (round.status == RoundStatus.CommitPhase) {
            round.status = RoundStatus.RevealPhase;
        }

        Commitment storage commitment = _commitments[roundId][msg.sender];
        require(commitment.stakeAmount > 0, "No commitment");
        require(!commitment.revealed, "Already revealed");

        // Verify commitment hash
        bytes32 expectedHash = keccak256(abi.encodePacked(choice, salt, msg.sender));
        require(commitment.commitHash == expectedHash, "Invalid reveal");

        commitment.revealed = true;
        commitment.revealedChoice = choice;
        
        _choiceTotals[roundId][choice] += commitment.stakeAmount;
        round.totalRevealed += commitment.stakeAmount;

        emit ChoiceRevealed(roundId, msg.sender, choice);
    }

    /**
     * @notice Finalizes the round with the winning choice
     * @param roundId The round ID
     * @param winningChoice The correct/winning choice
     */
    function finalize(
        uint256 roundId,
        uint8 winningChoice
    ) external nonReentrant {
        Round storage round = _rounds[roundId];
        
        require(round.createdAt > 0, "Round not found");
        require(
            round.status == RoundStatus.RevealPhase ||
            (round.status == RoundStatus.CommitPhase && block.timestamp >= round.revealDeadline),
            "Cannot finalize yet"
        );
        require(
            hasRole(RESOLVER_ROLE, msg.sender) || msg.sender == round.creator,
            "Not authorized"
        );
        require(winningChoice < round.choicesCount, "Invalid choice");

        round.status = RoundStatus.Finalized;
        round.winningChoice = winningChoice;

        // Calculate and transfer fees
        uint256 totalPayout = round.totalRevealed;
        uint256 platformFee = (totalPayout * round.platformFeeBps) / BPS_DENOMINATOR;
        uint256 creatorFee = (totalPayout * round.creatorFeeBps) / BPS_DENOMINATOR;

        if (platformFee > 0) {
            stakingToken.safeTransfer(treasury, platformFee);
        }
        if (creatorFee > 0) {
            stakingToken.safeTransfer(round.creator, creatorFee);
        }

        emit RoundFinalized(roundId, winningChoice, totalPayout - platformFee - creatorFee);
    }

    /**
     * @notice Cancels a round
     * @param roundId The round ID
     * @param reason Cancellation reason
     */
    function cancelRound(
        uint256 roundId,
        string calldata reason
    ) external nonReentrant {
        Round storage round = _rounds[roundId];
        
        require(round.createdAt > 0, "Round not found");
        require(round.status != RoundStatus.Finalized, "Already finalized");
        require(round.status != RoundStatus.Cancelled, "Already cancelled");
        require(
            hasRole(ADMIN_ROLE, msg.sender) || msg.sender == round.creator,
            "Not authorized"
        );

        round.status = RoundStatus.Cancelled;

        emit RoundCancelled(roundId, reason);
    }

    /**
     * @notice Claims reward for winners
     * @param roundId The round ID
     */
    function claimReward(uint256 roundId) external nonReentrant whenNotPaused {
        Round storage round = _rounds[roundId];
        require(round.status == RoundStatus.Finalized, "Not finalized");

        Commitment storage commitment = _commitments[roundId][msg.sender];
        require(commitment.revealed, "Not revealed");
        require(!commitment.claimed, "Already claimed");
        require(commitment.revealedChoice == round.winningChoice, "Not winner");

        uint256 reward = calculateReward(roundId, msg.sender);
        require(reward > 0, "No reward");

        commitment.claimed = true;
        stakingToken.safeTransfer(msg.sender, reward);

        emit RewardClaimed(roundId, msg.sender, reward);
    }

    /**
     * @notice Claims refund for cancelled rounds or unrevealed commits
     * @param roundId The round ID
     */
    function claimRefund(uint256 roundId) external nonReentrant {
        Round storage round = _rounds[roundId];
        Commitment storage commitment = _commitments[roundId][msg.sender];
        
        require(commitment.stakeAmount > 0, "No stake");
        require(!commitment.claimed, "Already claimed");

        bool canRefund = false;
        
        // Cancelled round - everyone gets refund
        if (round.status == RoundStatus.Cancelled) {
            canRefund = true;
        }
        // Finalized but didn't reveal - can get refund of unrevealed stake
        else if (round.status == RoundStatus.Finalized && !commitment.revealed) {
            canRefund = true;
        }

        require(canRefund, "Cannot refund");

        commitment.claimed = true;
        stakingToken.safeTransfer(msg.sender, commitment.stakeAmount);

        emit RefundClaimed(roundId, msg.sender, commitment.stakeAmount);
    }

    // ============ View Functions ============
    
    /**
     * @notice Gets round information
     */
    function getRound(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    /**
     * @notice Gets user's commitment
     */
    function getCommitment(
        uint256 roundId,
        address user
    ) external view returns (Commitment memory) {
        return _commitments[roundId][user];
    }

    /**
     * @notice Gets total staked on a choice (only accurate after reveals)
     */
    function getChoiceTotal(uint256 roundId, uint8 choice) external view returns (uint256) {
        return _choiceTotals[roundId][choice];
    }

    /**
     * @notice Calculates reward for a user
     */
    function calculateReward(uint256 roundId, address user) public view returns (uint256) {
        Round storage round = _rounds[roundId];
        if (round.status != RoundStatus.Finalized) return 0;

        Commitment storage commitment = _commitments[roundId][user];
        if (!commitment.revealed || commitment.revealedChoice != round.winningChoice) {
            return 0;
        }

        uint256 winningTotal = _choiceTotals[roundId][round.winningChoice];
        if (winningTotal == 0) return 0;

        uint256 totalFees = (round.totalRevealed * (round.platformFeeBps + round.creatorFeeBps)) / BPS_DENOMINATOR;
        uint256 payoutPool = round.totalRevealed - totalFees;

        return (commitment.stakeAmount * payoutPool) / winningTotal;
    }

    /**
     * @notice Generates commit hash for frontend
     */
    function generateCommitHash(
        uint8 choice,
        bytes32 salt,
        address user
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(choice, salt, user));
    }

    /**
     * @notice Gets round participants
     */
    function getRoundParticipants(uint256 roundId) external view returns (address[] memory) {
        return _roundParticipants[roundId];
    }

    // ============ Admin Functions ============
    
    function setPlatformFee(uint256 newFeeBps) external onlyRole(ADMIN_ROLE) {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        platformFeeBps = newFeeBps;
    }

    function setTreasury(address newTreasury) external onlyRole(ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid address");
        treasury = newTreasury;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
}

