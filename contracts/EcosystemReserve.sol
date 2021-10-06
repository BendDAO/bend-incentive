// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {VersionedInitializable} from "./libs/VersionedInitializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
/**
 * @title EcosystemReserve
 * @notice Stores all the AAVE kept for incentives, just giving approval to the different
 * systems that will pull AAVE funds for their specific use case
 * @author Aave
 **/
contract EcosystemReserve is VersionedInitializable {
  event NewFundsAdmin(address indexed fundsAdmin);

  address internal _fundsAdmin;

  uint256 public constant REVISION = 2;

  function getRevision() internal pure override returns (uint256) {
    return REVISION;
  }

  function getFundsAdmin() external view returns (address) {
    return _fundsAdmin;
  }

  modifier onlyFundsAdmin() {
    require(msg.sender == _fundsAdmin, "ONLY_BY_FUNDS_ADMIN");
    _;
  }

  function initialize(address reserveController) external initializer {
    _setFundsAdmin(reserveController);
  }

  function approve(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyFundsAdmin {
    token.approve(recipient, amount);
  }

  function transfer(
    IERC20 token,
    address recipient,
    uint256 amount
  ) external onlyFundsAdmin {
    token.transfer(recipient, amount);
  }

  function setFundsAdmin(address admin) public onlyFundsAdmin {
    _setFundsAdmin(admin);
  }

  function _setFundsAdmin(address admin) internal {
    _fundsAdmin = admin;
    emit NewFundsAdmin(admin);
  }
}