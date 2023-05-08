// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import "forge-std/Test.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../contracts/incentives/interfaces/IWETH.sol";
import "../../contracts/incentives/FeeCollector.sol";
import "../../contracts/incentives/FeeDistributor.sol";

contract FeeDistributorForkTest is Test {
    // the address of the contract on the mainnet fork
    address constant incentiveOwnerAddress =
        0xF1465c7Ea04765853Facc2D1ea68bc6e47bE90e1;
    address constant timelockControllerAddress =
        0x4e4C314E2391A58775be6a15d7A05419ba7D2B6e;
    address constant proxyAdminAddress =
        0x859f6e05410893fe64BC84d92BdA773fF798cf66;
    address constant feeCollectorAddress =
        0xf3aB1d58Ce6B9E0D42b8958c918649305e1b1d26;
    address constant feeDistributorAddress =
        0x2338D34337dd0811b684640de74717B73F7B8059;

    address watchUser1;
    address watchUser2;

    function setUp() public {
        watchUser1 = vm.envAddress("WATCH_USER_1");
        watchUser2 = vm.envAddress("WATCH_USER_2");
    }

    function testFork_UpgradeFeeCollector() public {
        // upgrading fee collector
        ProxyAdmin proxyAdmin = ProxyAdmin(proxyAdminAddress);

        TransparentUpgradeableProxy feeCollectorProxy = TransparentUpgradeableProxy(
                payable(feeCollectorAddress)
            );
        FeeCollector feeCollectorImpl = new FeeCollector();
        vm.prank(timelockControllerAddress);
        proxyAdmin.upgrade(feeCollectorProxy, address(feeCollectorImpl));

        FeeCollector feeCollector = FeeCollector(payable(feeCollectorAddress));
        IWETH weth = IWETH(address(feeCollector.WETH()));

        // set distributor
        vm.prank(incentiveOwnerAddress);
        feeCollector.setFeeDistributor(feeDistributorAddress);

        // got some weth to collector
        uint256 wethFeeAmount = 1.234e18;
        vm.deal(address(feeCollector), wethFeeAmount);
        vm.prank(address(feeCollector));
        weth.deposit{value: wethFeeAmount}();

        uint256 wethBalanceOfDistributorBeforeCollect = weth.balanceOf(
            feeDistributorAddress
        );
        uint256 wethBalanceOfTreasuryBeforeCollect = weth.balanceOf(
            feeCollector.treasury()
        );

        // collect weth to distributor
        feeCollector.collect();

        // check results
        uint256 feeRatio = feeCollector.treasuryPercentage();
        uint256 wethBalanceOfDistributorAfterCollect = weth.balanceOf(
            feeDistributorAddress
        );
        uint256 wethBalanceOfTreasuryAfterCollect = weth.balanceOf(
            feeCollector.treasury()
        );

        uint256 wethBalanceOfDistributorDelta = wethBalanceOfDistributorAfterCollect -
                wethBalanceOfDistributorBeforeCollect;
        uint256 wethBalanceOfTreasuryDelta = wethBalanceOfTreasuryAfterCollect -
            wethBalanceOfTreasuryBeforeCollect;

        assertEq(
            wethBalanceOfDistributorDelta,
            ((wethFeeAmount * feeRatio) / 10000),
            "distributor weth not match"
        );
        assertEq(
            wethBalanceOfTreasuryDelta,
            ((wethFeeAmount * feeRatio) / 10000),
            "distributor weth not match"
        );
    }

    function testFork_UpgradeFeeDistributor() public {
        // upgrading fee distributor
        ProxyAdmin proxyAdmin = ProxyAdmin(proxyAdminAddress);

        TransparentUpgradeableProxy feeDistributorProxy = TransparentUpgradeableProxy(
                payable(feeDistributorAddress)
            );
        FeeDistributor feeDistributorImpl = new FeeDistributor();
        vm.prank(timelockControllerAddress);
        proxyAdmin.upgrade(
            feeDistributorProxy,
            address(payable(feeDistributorImpl))
        );

        FeeDistributor feeDistributor = FeeDistributor(
            payable(feeDistributorAddress)
        );
        IERC20 bendWETH = IERC20(feeDistributor.token());
        IERC20 weth = IERC20(address(feeDistributor.WETH()));

        console.log("tokenLastBalance", feeDistributor.tokenLastBalance());

        uint256 bwethBalanceBeforeMigrate = bendWETH.balanceOf(
            feeDistributorAddress
        ) + bendWETH.balanceOf(feeDistributor.bendCollector());
        //uint256 wethBalanceBeforeMigrate = weth.balanceOf(feeDistributorAddress);

        console.log("bendWETH balanceOf", bwethBalanceBeforeMigrate);

        uint256 user1BalanceBeforeMigrate = weth.balanceOf(watchUser1);
        uint256 user2BalanceBeforeMigrate = weth.balanceOf(watchUser2);

        uint256 user1RewardsBeforeMigrate = feeDistributor.claimable(
            watchUser1
        );
        uint256 user2RewardsBeforeMigrate = feeDistributor.claimable(
            watchUser2
        );

        // migrate bendWETH to WETH
        //vm.prank(feeDistributor.owner());
        //feeDistributor.migrateBendWETHToWETH();
        feeDistributor.distribute();

        console.log("tokenLastBalance", feeDistributor.tokenLastBalance());

        uint256 bwethBalanceAfterMigrate = bendWETH.balanceOf(
            feeDistributorAddress
        );
        console.log("bendWETH balanceOf", bwethBalanceAfterMigrate);
        assertEq(
            bwethBalanceAfterMigrate,
            0,
            "bweth should be zero after migrate"
        );

        uint256 wethBalanceAfterMigrate = weth.balanceOf(feeDistributorAddress);
        console.log("WETH balanceOf", wethBalanceAfterMigrate);
        assertEq(
            wethBalanceAfterMigrate,
            bwethBalanceBeforeMigrate,
            "fee distributor weth balance not match"
        );

        // claim rewards
        vm.prank(watchUser1);
        feeDistributor.claim(true);

        vm.prank(watchUser2);
        feeDistributor.claim(true);

        // check results
        uint256 user1BalanceAfterMigrate = weth.balanceOf(watchUser1);
        assertEq(
            user1BalanceAfterMigrate,
            (user1BalanceBeforeMigrate + user1RewardsBeforeMigrate),
            "user1 rewards not match"
        );
        uint256 user2BalanceAfterMigrate = weth.balanceOf(watchUser2);
        assertEq(
            user2BalanceAfterMigrate,
            (user2BalanceBeforeMigrate + user2RewardsBeforeMigrate),
            "user2 rewards not match"
        );
    }
}
