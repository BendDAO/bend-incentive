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

    function testFork_Pause() public {
        // upgrading
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(lockupV2))),
            address(new LockupBendV2())
        );
        vm.stopPrank();

        address user = 0xCF620C347386c42CDeC152688b881E767c614d70;

        // paused
        vm.startPrank(incentiveOwnerAddress);
        lockupV2.setPause(true);
        vm.stopPrank();

        vm.startPrank(user);
        vm.expectRevert(bytes("Paused"));
        lockupV2.withdraw();
        vm.stopPrank();

        // unpaused
        vm.startPrank(incentiveOwnerAddress);
        lockupV2.setPause(false);
        vm.stopPrank();

        vm.startPrank(user);
        lockupV2.withdraw();
        vm.stopPrank();
    }
}
