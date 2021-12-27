// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IIncentivesController} from "../incentives/interfaces/IIncentivesController.sol";
import {DistributionTypes} from "../incentives/DistributionTypes.sol";
import {IScaledBalanceToken} from "../incentives/interfaces/IScaledBalanceToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BTokenMock is IScaledBalanceToken, ERC20 {
    IIncentivesController public aic;
    uint256 internal __totalSupply;
    mapping(address => uint256) private balances;

    constructor(
        string memory _name,
        string memory _symbol,
        IIncentivesController _aic
    ) ERC20(_name, _symbol) {
        aic = _aic;
    }

    function handleActionOnAic(
        address _user,
        uint256 _totalSupply,
        uint256 _userBalance
    ) external {
        aic.handleAction(_user, _totalSupply, _userBalance);
    }

    function setUserBalanceAndSupply(
        address _user,
        uint256 _userBalance,
        uint256 _totalSupply
    ) public {
        balances[_user] = _userBalance;
        __totalSupply = _totalSupply;
    }

    function getScaledUserBalanceAndSupply(address _user)
        external
        view
        override
        returns (uint256, uint256)
    {
        return (balances[_user], __totalSupply);
    }

    function scaledTotalSupply() public view override returns (uint256) {
        return __totalSupply;
    }
}
