// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPicoPrizeReputation {
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
        uint256 averageRating;
        uint256 ratingCount;
    }

    function recordChallengeResult(
        address user,
        bool won,
        uint256 stakeAmount,
        uint256 winAmount
    ) external;

    function recordLessonCompletion(address user) external;

    function updateCreatorStats(
        address creator,
        bool newLesson,
        uint256 participants,
        uint256 feesEarned
    ) external;

    function getUserStats(address user) external view returns (UserStats memory);
    function getCreatorStats(address creator) external view returns (CreatorStats memory);
}


