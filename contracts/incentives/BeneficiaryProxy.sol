// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface ILockupV2Min {
  function withdraw() external;
}

contract BeneficiaryProxy is OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  modifier onlyAuthed() {
    require(
      msg.sender == owner() || msg.sender == beneficiary,
      "BeneficiaryProxy: caller not authed"
    );
    _;
  }
  ILockupV2Min public lockup;
  IERC20Upgradeable public bendToken;
  address public beneficiary;

  function initialize(address _lockup, address _bendToken)
    external
    initializer
  {
    __Ownable_init();
    lockup = ILockupV2Min(_lockup);
    bendToken = IERC20Upgradeable(_bendToken);
  }

  function setBeneficiary(address _beneficiary) external onlyOwner {
    beneficiary = _beneficiary;
  }

  function withdraw() external onlyAuthed {
    require(
      address(lockup) != address(0),
      "BeneficiaryProxy: invalid lockup contract"
    );
    require(
      address(beneficiary) != address(0),
      "BeneficiaryProxy: invalid beneficiary"
    );
    require(
      address(bendToken) != address(0),
      "BeneficiaryProxy: invalid bendToken contract"
    );

    uint256 withdrawnAmount = bendToken.balanceOf(address(this));
    lockup.withdraw();
    withdrawnAmount = bendToken.balanceOf(address(this)) - withdrawnAmount;
    bendToken.safeTransfer(beneficiary, withdrawnAmount);
  }
}
