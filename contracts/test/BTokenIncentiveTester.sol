// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
pragma abicoder v2;

import {IIncentivesController} from "../incentives/interfaces/IIncentivesController.sol";
import {DistributionTypes} from "../incentives/DistributionTypes.sol";
import {IScaledBalanceToken} from "../incentives/interfaces/IScaledBalanceToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BTokenIncentiveTester is IScaledBalanceToken, ERC20 {
    IIncentivesController public aic;

    constructor(
        string memory _name,
        string memory _symbol,
        IIncentivesController _aic
    ) ERC20(_name, _symbol) {
        aic = _aic;
    }

    function handleAction(
        address _user,
        uint256 _totalSupply,
        uint256 _userBalance
    ) external {
        aic.handleAction(_user, _totalSupply, _userBalance);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal override {
        uint256 currentTotalSupply = super.totalSupply();
        uint256 oldSenderBalance = super.balanceOf(sender);
        uint256 oldRecipientBalance = super.balanceOf(recipient);
        super._transfer(sender, recipient, amount);
        aic.handleAction(sender, currentTotalSupply, oldSenderBalance);
        if (sender != recipient) {
            aic.handleAction(
                recipient,
                currentTotalSupply,
                oldRecipientBalance
            );
        }
    }

    function mint(address account, uint256 amount) public {
        uint256 oldTotalSupply = super.totalSupply();
        uint256 oldAccountBalance = super.balanceOf(account);
        super._mint(account, amount);
        aic.handleAction(account, oldTotalSupply, oldAccountBalance);
    }

    function burn(address account, uint256 amount) public {
        uint256 oldTotalSupply = super.totalSupply();
        uint256 oldAccountBalance = super.balanceOf(account);
        super._burn(account, amount);
        aic.handleAction(account, oldTotalSupply, oldAccountBalance);
    }

    function getScaledUserBalanceAndSupply(address _user)
        external
        view
        override
        returns (uint256, uint256)
    {
        return (super.balanceOf(_user), super.totalSupply());
    }

    function scaledTotalSupply() public view override returns (uint256) {
        return super.totalSupply();
    }
}
