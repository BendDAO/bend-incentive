// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IStakedToken} from "../../stake/interfaces/IStakedToken.sol";

interface IStakedTokenWithConfig is IStakedToken {
  function STAKED_TOKEN() external view returns(address);
}