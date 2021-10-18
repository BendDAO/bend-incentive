// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../stake/StakedToken.sol";

contract StakedTokenTester is StakedToken {
    function getRewards(
        uint256 principalUserBalance,
        uint256 reserveIndex,
        uint256 userIndex
    ) external pure returns (uint256) {
        return _getRewards(principalUserBalance, reserveIndex, userIndex);
    }
}
