// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.0;

import {KeeperCompatibleInterface} from "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";

contract BendKeeper is KeeperCompatibleInterface {
    uint256 public interval;
    uint256 public lastTimeStamp;
    IFeeDistributor public feeDistributor;

    constructor(uint256 _interval, address _feeDistributorAddr) {
        interval = _interval;
        lastTimeStamp = block.timestamp;
        feeDistributor = IFeeDistributor(_feeDistributorAddr);
    }

    function checkUpkeep(bytes calldata)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory)
    {
        upkeepNeeded = (block.timestamp - lastTimeStamp) > interval;
    }

    function performUpkeep(bytes calldata) external override {
        if ((block.timestamp - lastTimeStamp) > interval) {
            lastTimeStamp = block.timestamp;
            feeDistributor.distribute();
        }
    }
}
