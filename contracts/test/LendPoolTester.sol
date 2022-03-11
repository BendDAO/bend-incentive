// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {ILendPool} from "../incentives/interfaces/ILendPool.sol";
import {IBToken} from "./IBToken.sol";

contract LendPoolTester is ILendPool {
    function withdraw(
        address reserve,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        IBToken(reserve).burn(msg.sender, to, amount, 0);
        return amount;
    }
}
