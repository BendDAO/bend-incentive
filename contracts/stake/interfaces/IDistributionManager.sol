// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {DistributionTypes} from "../DistributionTypes.sol";

interface IDistributionManager {
    function configureAssets(
        DistributionTypes.AssetConfigInput[] calldata assetsConfigInput
    ) external;
}
