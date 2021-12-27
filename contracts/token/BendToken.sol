// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {ERC20Detailed} from "../libs/ERC20Detailed.sol";
import {IVault} from "./interfaces/IVault.sol";

/**
 * @notice implementation of the BEND token contract
 * @author Bend
 */
contract BendToken is ERC20Detailed {
    string internal constant NAME = "Bend Token";
    string internal constant SYMBOL = "BEND";
    uint8 internal constant DECIMALS = 18;

    string public constant REVISION = "1";

    function initialize(IVault _vault, uint256 _amount) external initializer {
        __ERC20Detailed_init(NAME, SYMBOL, DECIMALS);
        _mint(address(_vault), _amount);
    }
}
