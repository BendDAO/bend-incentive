// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {WETH9} from "./WETH9.sol";

contract WETH9Tester is WETH9 {
    // Mint not backed by Ether: only for testing purposes
    function mint(address to, uint256 value) public returns (bool) {
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
        return true;
    }

    function setBalance(address to, uint256 amount) public {
        balanceOf[to] = amount;
    }
}
