// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PicoPrizeReputation
 * @author PicoPrize Team
 * @notice On-chain reputation system for PicoPrize learners and creators
 * @dev Tracks reputation points, achievements, and user statistics
 * 
 * Features:
 * - Reputation points for correct answers
 * - Streak tracking for consecutive wins
 * - Achievement badges
 * - Creator reputation separate from learner reputation
 */
contract PicoPrizeReputation is AccessControl, Pausable {
    
    // ============ Constants ============
    
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    uint256 public constant BASE_POINTS_WIN = 100;
    uint256 public constant BASE_POINTS_PARTICIPATE = 10;
    uint256 public constant STREAK_BONUS_MULTIPLIER = 10; // 10% per streak level
    uint256 public constant MAX_STREAK_BONUS = 100; // Max 100% bonus (10 streak)

    // ============ Structs ============
    
    struct UserStats {
        uint256 totalPoints;
        uint256 lessonsCompleted;
        uint256 challengesWon;
        uint256 challengesLost;
        uint256 totalStaked;
        uint256 totalWon;
        uint256 currentStreak;
        uint256 longestStreak;
        uint256 lastActivityTimestamp;
        uint256 registeredAt;
    }

    struct CreatorStats {
        uint256 lessonsCreated;
        uint256 totalParticipants;
        uint256 totalPoolsSeeded;
        uint256 totalFeesEarned;
        uint256 averageRating; // Out of 100
        uint256 ratingCount;
    }

    struct Achievement {
        string name;
        string description;
        string imageUri;
        uint256 requiredPoints;
        bool exists;
    }

    // ============ Events ============
    
    event ReputationUpdated(
        address indexed user,
        uint256 oldPoints,
        uint256 newPoints,
        string reason
    );

    event StreakUpdated(
        address indexed user,
        uint256 newStreak,
        bool isNewRecord
    );

    event AchievementUnlocked(
        address indexed user,
        uint256 indexed achievementId,
        string achievementName
    );

    event CreatorStatsUpdated(
        address indexed creator,
        uint256 lessonsCreated,
        uint256 totalParticipants
    );

    event UserRegistered(address indexed user, uint256 timestamp);

    // ============ State Variables ============
    
    mapping(address => UserStats) private _userStats;
    mapping(address => CreatorStats) private _creatorStats;
    mapping(uint256 => Achievement) private _achievements;
    mapping(address => mapping(uint256 => bool)) private _userAchievements;
    mapping(address => uint256[]) private _userAchievementList;
    
    uint256 public achievementCounter;
    address[] private _allUsers;
    mapping(address => bool) private _isRegistered;

    // ============ Constructor ============
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
        
        // Initialize default achievements
        _createAchievement("First Steps", "Complete your first lesson", "", 0);
        _createAchievement("Quick Learner", "Win 5 challenges", "", 500);
        _createAchievement("Scholar", "Earn 1000 reputation points", "", 1000);
        _createAchievement("Expert", "Earn 5000 reputation points", "", 5000);
        _createAchievement("Master", "Earn 10000 reputation points", "", 10000);
        _createAchievement("On Fire", "Achieve a 5 win streak", "", 0);
        _createAchievement("Unstoppable", "Achieve a 10 win streak", "", 0);
    }

    // ============ External Functions ============
    
    /**
     * @notice Registers a new user
     * @param user Address of the user
     */
    function registerUser(address user) external onlyRole(UPDATER_ROLE) {
        require(!_isRegistered[user], "Already registered");
        
        _isRegistered[user] = true;
        _allUsers.push(user);
        _userStats[user].registeredAt = block.timestamp;
        
        emit UserRegistered(user, block.timestamp);
    }

    /**
     * @notice Records a challenge result
     * @param user Address of the user
     * @param won Whether the user won
     * @param stakeAmount Amount staked
     * @param winAmount Amount won (0 if lost)
     */
    function recordChallengeResult(
        address user,
        bool won,
        uint256 stakeAmount,
        uint256 winAmount
    ) external onlyRole(UPDATER_ROLE) whenNotPaused {
        _ensureRegistered(user);
        
        UserStats storage stats = _userStats[user];
        uint256 oldPoints = stats.totalPoints;
        
        stats.totalStaked += stakeAmount;
        stats.lastActivityTimestamp = block.timestamp;
        
        if (won) {
            stats.challengesWon++;
            stats.totalWon += winAmount;
            stats.currentStreak++;
            
            // Update longest streak
            if (stats.currentStreak > stats.longestStreak) {
                stats.longestStreak = stats.currentStreak;
                emit StreakUpdated(user, stats.currentStreak, true);
            } else {
                emit StreakUpdated(user, stats.currentStreak, false);
            }
            
            // Calculate points with streak bonus
            uint256 streakBonus = stats.currentStreak * STREAK_BONUS_MULTIPLIER;
            if (streakBonus > MAX_STREAK_BONUS) {
                streakBonus = MAX_STREAK_BONUS;
            }
            uint256 points = BASE_POINTS_WIN + (BASE_POINTS_WIN * streakBonus / 100);
            stats.totalPoints += points;
            
            // Check streak achievements
            if (stats.currentStreak == 5) {
                _unlockAchievement(user, 5); // "On Fire"
            } else if (stats.currentStreak == 10) {
                _unlockAchievement(user, 6); // "Unstoppable"
            }
        } else {
            stats.challengesLost++;
            stats.currentStreak = 0;
            stats.totalPoints += BASE_POINTS_PARTICIPATE;
            emit StreakUpdated(user, 0, false);
        }
        
        emit ReputationUpdated(user, oldPoints, stats.totalPoints, won ? "Challenge Won" : "Challenge Lost");
        
        // Check point-based achievements
        _checkPointAchievements(user);
    }

    /**
     * @notice Records lesson completion (without stake)
     * @param user Address of the user
     */
    function recordLessonCompletion(address user) external onlyRole(UPDATER_ROLE) whenNotPaused {
        _ensureRegistered(user);
        
        UserStats storage stats = _userStats[user];
        uint256 oldPoints = stats.totalPoints;
        
        stats.lessonsCompleted++;
        stats.totalPoints += BASE_POINTS_PARTICIPATE;
        stats.lastActivityTimestamp = block.timestamp;
        
        // First lesson achievement
        if (stats.lessonsCompleted == 1) {
            _unlockAchievement(user, 0); // "First Steps"
        }
        
        emit ReputationUpdated(user, oldPoints, stats.totalPoints, "Lesson Completed");
    }

    /**
     * @notice Updates creator statistics
     * @param creator Address of the creator
     * @param newLesson Whether a new lesson was created
     * @param participants Number of new participants
     * @param feesEarned Fees earned from this action
     */
    function updateCreatorStats(
        address creator,
        bool newLesson,
        uint256 participants,
        uint256 feesEarned
    ) external onlyRole(UPDATER_ROLE) whenNotPaused {
        CreatorStats storage stats = _creatorStats[creator];
        
        if (newLesson) {
            stats.lessonsCreated++;
            stats.totalPoolsSeeded++;
        }
        stats.totalParticipants += participants;
        stats.totalFeesEarned += feesEarned;
        
        emit CreatorStatsUpdated(creator, stats.lessonsCreated, stats.totalParticipants);
    }

    /**
     * @notice Rates a creator
     * @param creator Address of the creator
     * @param rating Rating out of 100
     */
    function rateCreator(address creator, uint256 rating) external whenNotPaused {
        require(rating <= 100, "Rating must be 0-100");
        require(_isRegistered[msg.sender], "Must be registered");
        
        CreatorStats storage stats = _creatorStats[creator];
        
        // Calculate new average
        uint256 totalRating = stats.averageRating * stats.ratingCount + rating;
        stats.ratingCount++;
        stats.averageRating = totalRating / stats.ratingCount;
    }

    // ============ View Functions ============
    
    /**
     * @notice Gets user statistics
     */
    function getUserStats(address user) external view returns (UserStats memory) {
        return _userStats[user];
    }

    /**
     * @notice Gets creator statistics
     */
    function getCreatorStats(address creator) external view returns (CreatorStats memory) {
        return _creatorStats[creator];
    }

    /**
     * @notice Gets user's achievements
     */
    function getUserAchievements(address user) external view returns (uint256[] memory) {
        return _userAchievementList[user];
    }

    /**
     * @notice Checks if user has achievement
     */
    function hasAchievement(address user, uint256 achievementId) external view returns (bool) {
        return _userAchievements[user][achievementId];
    }

    /**
     * @notice Gets achievement details
     */
    function getAchievement(uint256 achievementId) external view returns (Achievement memory) {
        return _achievements[achievementId];
    }

    /**
     * @notice Gets leaderboard (top N users by points)
     * @param count Number of users to return
     */
    function getLeaderboard(uint256 count) external view returns (
        address[] memory users,
        uint256[] memory points
    ) {
        uint256 length = _allUsers.length < count ? _allUsers.length : count;
        users = new address[](length);
        points = new uint256[](length);
        
        // Simple sorting (not gas efficient for large lists - use off-chain for production)
        address[] memory sortedUsers = new address[](_allUsers.length);
        for (uint256 i = 0; i < _allUsers.length; i++) {
            sortedUsers[i] = _allUsers[i];
        }
        
        // Bubble sort (for small lists only)
        for (uint256 i = 0; i < sortedUsers.length; i++) {
            for (uint256 j = i + 1; j < sortedUsers.length; j++) {
                if (_userStats[sortedUsers[j]].totalPoints > _userStats[sortedUsers[i]].totalPoints) {
                    address temp = sortedUsers[i];
                    sortedUsers[i] = sortedUsers[j];
                    sortedUsers[j] = temp;
                }
            }
        }
        
        for (uint256 i = 0; i < length; i++) {
            users[i] = sortedUsers[i];
            points[i] = _userStats[sortedUsers[i]].totalPoints;
        }
        
        return (users, points);
    }

    /**
     * @notice Checks if user is registered
     */
    function isRegistered(address user) external view returns (bool) {
        return _isRegistered[user];
    }

    /**
     * @notice Gets total registered users
     */
    function getTotalUsers() external view returns (uint256) {
        return _allUsers.length;
    }

    // ============ Admin Functions ============
    
    /**
     * @notice Creates a new achievement
     */
    function createAchievement(
        string calldata name,
        string calldata description,
        string calldata imageUri,
        uint256 requiredPoints
    ) external onlyRole(ADMIN_ROLE) {
        _createAchievement(name, description, imageUri, requiredPoints);
    }

    /**
     * @notice Manually awards achievement to user
     */
    function awardAchievement(
        address user,
        uint256 achievementId
    ) external onlyRole(ADMIN_ROLE) {
        require(_achievements[achievementId].exists, "Achievement not found");
        _unlockAchievement(user, achievementId);
    }

    /**
     * @notice Grants updater role to contract
     */
    function addUpdater(address updater) external onlyRole(ADMIN_ROLE) {
        grantRole(UPDATER_ROLE, updater);
    }

    /**
     * @notice Revokes updater role
     */
    function removeUpdater(address updater) external onlyRole(ADMIN_ROLE) {
        revokeRole(UPDATER_ROLE, updater);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ Internal Functions ============
    
    function _ensureRegistered(address user) internal {
        if (!_isRegistered[user]) {
            _isRegistered[user] = true;
            _allUsers.push(user);
            _userStats[user].registeredAt = block.timestamp;
            emit UserRegistered(user, block.timestamp);
        }
    }

    function _createAchievement(
        string memory name,
        string memory description,
        string memory imageUri,
        uint256 requiredPoints
    ) internal {
        _achievements[achievementCounter] = Achievement({
            name: name,
            description: description,
            imageUri: imageUri,
            requiredPoints: requiredPoints,
            exists: true
        });
        achievementCounter++;
    }

    function _unlockAchievement(address user, uint256 achievementId) internal {
        if (!_userAchievements[user][achievementId] && _achievements[achievementId].exists) {
            _userAchievements[user][achievementId] = true;
            _userAchievementList[user].push(achievementId);
            emit AchievementUnlocked(user, achievementId, _achievements[achievementId].name);
        }
    }

    function _checkPointAchievements(address user) internal {
        uint256 points = _userStats[user].totalPoints;
        
        // Quick Learner - 5 wins (500 points minimum)
        if (points >= 500 && _userStats[user].challengesWon >= 5) {
            _unlockAchievement(user, 1);
        }
        // Scholar - 1000 points
        if (points >= 1000) {
            _unlockAchievement(user, 2);
        }
        // Expert - 5000 points
        if (points >= 5000) {
            _unlockAchievement(user, 3);
        }
        // Master - 10000 points
        if (points >= 10000) {
            _unlockAchievement(user, 4);
        }
    }
}

