// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

pragma experimental ABIEncoderV2;

import {
    IIncentivesController
} from "../incentives/interfaces/IIncentivesController.sol";
import {DistributionTypes} from "../stake/DistributionTypes.sol";
import {IBToken} from "../incentives/interfaces/IBToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BTokenMock is IBToken, ERC20 {
    IIncentivesController public _aic;
    uint256 internal _totalSupply;
    mapping(address => uint256) private _balances;

    constructor(
        string memory name_,
        string memory symbol_,
        IIncentivesController aic
    ) ERC20(name_, symbol_) {
        _aic = aic;
    }

    function handleActionOnAic(
        address user,
        uint256 userBalance,
        uint256 totalSupply
    ) external {
        _aic.handleAction(user, userBalance, totalSupply);
    }

    function setUserBalanceAndSupply(
        address user,
        uint256 userBalance,
        uint256 totalSupply
    ) public {
        _balances[user] = userBalance;
        _totalSupply = totalSupply;
    }

    function getScaledUserBalanceAndSupply(address user)
        external
        view
        override
        returns (uint256, uint256)
    {
        return (_balances[user], _totalSupply);
    }

    function scaledTotalSupply() public view override returns (uint256) {
        return _totalSupply;
    }
}
