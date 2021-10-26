// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {GovernanceToken} from "./gov/GovernanceToken.sol";

/**
 * @notice implementation of the BEND token contract
 * @author Bend
 */
contract BendToken is GovernanceToken {
    string internal constant NAME = "Bend Token";
    string internal constant SYMBOL = "BEND";
    uint8 internal constant DECIMALS = 18;

    string public constant REVISION = "1";

    function initialize() external initializer {
        __ERC20Detailed_init(NAME, SYMBOL, DECIMALS);
        _setDomainSeparator(NAME, REVISION);
    }
}
