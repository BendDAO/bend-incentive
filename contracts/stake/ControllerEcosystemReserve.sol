// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEcosystemReserve} from "./interfaces/IEcosystemReserve.sol";

contract ControllerEcosystemReserve is Ownable {
    IEcosystemReserve public immutable RESERVE_ECOSYSTEM;

    constructor(
        address aaveGovShortTimelock,
        IEcosystemReserve ecosystemReserve
    ) {
        RESERVE_ECOSYSTEM = ecosystemReserve;
        transferOwnership(aaveGovShortTimelock);
    }

    function approve(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        RESERVE_ECOSYSTEM.approve(token, recipient, amount);
    }

    function transfer(
        IERC20 token,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        RESERVE_ECOSYSTEM.transfer(token, recipient, amount);
    }
}
