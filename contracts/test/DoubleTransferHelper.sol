// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DoubleTransferHelper {
    IERC20 public immutable token;

    constructor(IERC20 _token) public {
        token = _token;
    }

    function doubleSend(
        address to,
        uint256 amount1,
        uint256 amount2
    ) external {
        token.transfer(to, amount1);
        token.transfer(to, amount2);
    }
}
