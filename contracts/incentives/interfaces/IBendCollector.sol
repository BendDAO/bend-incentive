// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IBendCollector {
    function approve(
        IERC20Upgradeable token,
        address recipient,
        uint256 amount
    ) external;
}
