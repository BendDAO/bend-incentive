// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {DistributionTypes} from "../DistributionTypes.sol";

interface IStakedToken is IERC20Upgradeable {
    function configureAssets(
        DistributionTypes.AssetConfigInput[] calldata assetsConfigInput
    ) external;

    function stake(address to, uint256 amount) external;

    function redeem(address to, uint256 amount) external;

    function cooldown() external;

    function claimRewards(address to, uint256 amount) external;
}
