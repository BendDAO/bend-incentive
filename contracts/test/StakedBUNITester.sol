// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {StakedBUNI} from "../incentives/StakedBUNI.sol";

contract StakedBUNITester is StakedBUNI {
    function updateCurrentUnclaimedRewards(address[] calldata _users) external {
        for (uint256 i = 0; i < _users.length; i++) {
            _updateCurrentUnclaimedRewards(
                _users[i],
                balanceOf(_users[i]),
                true
            );
        }
    }
}
