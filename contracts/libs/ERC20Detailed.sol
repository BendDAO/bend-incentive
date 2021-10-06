// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract ERC20Detailed is ERC20Upgradeable {
    uint8 private _decimals;

    function __ERC20Detailed_init(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) public initializer {
        __ERC20_init(name_, symbol_);
        _decimals = decimals_;
    }

    /**
     * @return the decimals of the token
     **/

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
