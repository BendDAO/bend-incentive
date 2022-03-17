// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.0;
import {BendToken} from "../token/BendToken.sol";

contract BendTokenTester is BendToken {
    function setBalance(address to, uint256 amount) public {
        uint256 old = balanceOf(to);
        if (old < amount) {
            _mint(to, amount - old);
        } else if (old > amount) {
            _burn(to, old - amount);
        }
    }
}
