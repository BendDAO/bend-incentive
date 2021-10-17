// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../token/BendToken.sol";

contract BendTokenTester is BendToken {
    function mint(address _account, uint256 _amount) external {
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external {
        _burn(_account, _amount);
    }
}
