// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IScaledBalanceToken} from "./IScaledBalanceToken.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IDebtBToken is IScaledBalanceToken, IERC20Upgradeable {}
