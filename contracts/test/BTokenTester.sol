// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IBToken} from "./IBToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BTokenTester is IBToken, ERC20 {
    using SafeERC20 for IERC20;
    IERC20 public underlyingToken;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlyingToken
    ) ERC20(_name, _symbol) {
        underlyingToken = IERC20(_underlyingToken);
    }

    function burn(
        address user,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 //ignore
    ) public override {
        super._burn(user, amount);
        underlyingToken.safeTransfer(receiverOfUnderlying, amount);
    }

    function mint(
        address user,
        uint256 amount,
        uint256 // ignore
    ) public override returns (bool) {
        super._mint(user, amount);
        underlyingToken.safeTransferFrom(user, address(this), amount);
        return true;
    }

    function setBalance(address to, uint256 amount) public {
        uint256 old = balanceOf(to);
        if (old < amount) {
            _mint(to, amount - old);
        } else if (old > amount) {
            _burn(to, old - amount);
        }
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
