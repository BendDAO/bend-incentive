// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
import {IScaledBalanceToken} from "../incentives/interfaces/IScaledBalanceToken.sol";

interface IBToken is IScaledBalanceToken {
    function burn(
        address user,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external;
}
