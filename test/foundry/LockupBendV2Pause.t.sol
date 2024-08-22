// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import "forge-std/Test.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import "../../contracts/incentives/LockupBendV2.sol";

contract LockupBendV2PauseTest is Test {
    using PercentageMath for uint256;

    // the address of the contract on the mainnet fork
    address constant incentiveOwnerAddress =
        0x4D62360CEcF722A7888b1f97D4c7e8b170071248;
    address constant timelockControllerAddress =
        0x47253C6AD6ec68DeD8Fc91503A354c792Bb0932f;
    address constant proxyAdminAddress =
        0x49b1fE3db39D8ee873b4B45602A5127E99d4cfF6;

    LockupBendV2 lockupV2 =
        LockupBendV2(0x7941D082D46a9A8c3E8c2106187A24B74cc1bdD3);

    // how to run this testcase
    // forge test -vvv --match-contract LockupBendV2PauseTest --fork-url https://RPC --fork-block-number xxxxx

    function setUp() public {}

    function testFork_TransferBeneficiary() public {
        // upgrading
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(lockupV2))),
            address(new LockupBendV2())
        );
        vm.stopPrank();

        address user1 = 0x2dEF095549a4F48EAF37a338822Dad9fadae22af;
        address user2 = 0x200D2620eeaaD4cd52075Df841dF95a12e2C7708;

        uint256 user1LockAmountBefore = lockupV2.lockedAmount(user1);
        assertGt(user1LockAmountBefore, 0, "user1LockAmountBefore not gt");

        // transfer
        vm.prank(incentiveOwnerAddress);
        lockupV2.transferBeneficiary(user1, user2);

        uint256 user1LockAmount = lockupV2.lockedAmount(user1);
        assertEq(user1LockAmount, 0, "user1LockAmount not eq");

        uint256 user1Withdrawable = lockupV2.withdrawable(user1);
        assertEq(user1Withdrawable, 0, "user1Withdrawable not eq");

        uint256 user2LockAmount = lockupV2.lockedAmount(user2);
        assertEq(user2LockAmount, user1LockAmountBefore, "user2LockAmount not eq");
    }

    function testFork_GlobalPause() public {
        // upgrading
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(lockupV2))),
            address(new LockupBendV2())
        );
        vm.stopPrank();

        address user = 0x2dEF095549a4F48EAF37a338822Dad9fadae22af;

        // paused
        vm.prank(incentiveOwnerAddress);
        lockupV2.setGlobalPause(true);

        vm.prank(user);
        vm.expectRevert(bytes("Global Paused"));
        lockupV2.withdraw();

        // unpaused
        vm.prank(incentiveOwnerAddress);
        lockupV2.setGlobalPause(false);

        vm.prank(user);
        lockupV2.withdraw();
    }

    function testFork_BeneficiaryPause() public {
        // upgrading
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(lockupV2))),
            address(new LockupBendV2())
        );
        vm.stopPrank();

        address user = 0x2dEF095549a4F48EAF37a338822Dad9fadae22af;

        // paused
        vm.prank(incentiveOwnerAddress);
        lockupV2.setBeneficiaryPause(user, true);

        vm.prank(user);
        vm.expectRevert(bytes("Beneficiary Paused"));
        lockupV2.withdraw();

        // unpaused
        vm.prank(incentiveOwnerAddress);
        lockupV2.setBeneficiaryPause(user, false);

        vm.prank(user);
        lockupV2.withdraw();
    }
}
