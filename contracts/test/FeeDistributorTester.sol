// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {FeeDistributor} from "../incentives/FeeDistributor.sol";

contract FeeDistributorTester is FeeDistributor {
    // mock first init
    function start() external {
        uint256 t = (block.timestamp / WEEK) * WEEK;
        startTime = t;
        lastDistributeTime = t;
        timeCursor = t;
    }
}
