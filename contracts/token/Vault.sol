// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IVault} from "./interfaces/IVault.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EcosystemReserve
 * @notice Stores all the BEND kept for incentives, just giving approval to the different
 * systems that will pull BEND funds for their specific use case
 * @author Bend
 **/
contract Vault is Ownable, IVault {
    function approve(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external override onlyOwner {
        token.approve(recipient, amount);
    }

    function transfer(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external override onlyOwner {
        token.transfer(recipient, amount);
    }
}
