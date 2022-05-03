// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
import {ILendPool} from "../incentives/interfaces/ILendPool.sol";
import {IBToken} from "./IBToken.sol";

contract LendPoolTester is ILendPool {
    mapping(address => address) internal _reserves;

    function registerReserve(address _reverve, address _underlying) external {
        _reserves[_underlying] = _reverve;
    }

    function withdraw(
        address reserve,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        IBToken(_reserves[reserve]).burn(msg.sender, to, amount, 0);
        return amount;
    }

    function deposit(
        address reserve,
        uint256 amount,
        address onBehalfOf,
        uint16 // referralCode
    ) external override {
        IBToken(_reserves[reserve]).mint(onBehalfOf, amount, 0);
    }
}
