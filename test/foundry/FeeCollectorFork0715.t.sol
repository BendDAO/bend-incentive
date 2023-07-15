// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import "forge-std/Test.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../contracts/incentives/interfaces/IWETH.sol";
import "../../contracts/incentives/FeeCollector.sol";
import "../../contracts/incentives/FeeDistributor.sol";
import "../../contracts/libs/PercentageMath.sol";

contract FeeCollectorFork0715Test is Test {
    using PercentageMath for uint256;

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

    // how to run this testcase
    // forge test --match-contract FeeCollectorFork0715Test --fork-url https://RPC --fork-block-number 17697506

    function setUp() public {}

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

        // get balance before collect
        IERC20 bweth = IERC20(address(feeCollector.BWETH()));
        uint256 bwethFeeAmount = bweth.balanceOf(feeCollectorAddress);
        console.log("bwethFeeAmount:", bwethFeeAmount);

        uint256 bwethBalanceOfDistributorBeforeCollect = bweth.balanceOf(
            feeDistributorAddress
        );
        uint256 bwethBalanceOfTreasuryBeforeCollect = bweth.balanceOf(
            feeCollector.treasury()
        );

        IERC20 weth = IERC20(address(feeCollector.WETH()));
        uint256 wethFeeAmount = weth.balanceOf(feeCollectorAddress);
        console.log("wethFeeAmount:", wethFeeAmount);

        uint256 wethBalanceOfDistributorBeforeCollect = weth.balanceOf(
            feeDistributorAddress
        );
        uint256 wethBalanceOfTreasuryBeforeCollect = weth.balanceOf(
            feeCollector.treasury()
        );

        // collect bweth to distributor
        feeCollector.collect();

        // check results
        uint256 feeRatio = feeCollector.treasuryPercentage();

        // check bweth results
        {
            uint256 bwethAmountToTreasury = bwethFeeAmount.percentMul(feeRatio);
            uint256 bwethAmountToDistributor = (bwethFeeAmount -
                bwethAmountToTreasury);

            uint256 bwethBalanceOfTreasuryAfterCollect = bweth.balanceOf(
                feeCollector.treasury()
            );
            uint256 bwethBalanceOfDistributorAfterCollect = bweth.balanceOf(
                feeDistributorAddress
            );

            uint256 bwethBalanceOfTreasuryDelta = bwethBalanceOfTreasuryAfterCollect -
                    bwethBalanceOfTreasuryBeforeCollect;
            uint256 bwethBalanceOfDistributorDelta = bwethBalanceOfDistributorAfterCollect -
                    bwethBalanceOfDistributorBeforeCollect;

            assertEq(
                bwethBalanceOfTreasuryDelta,
                bwethAmountToTreasury,
                "treasury bweth not match"
            );

            assertEq(
                bwethBalanceOfDistributorDelta,
                bwethAmountToDistributor,
                "distributor bweth not match"
            );
        }

        // check weth results
        {
            uint256 wethAmountToTreasury = wethFeeAmount.percentMul(feeRatio);
            uint256 wethAmountToDistributor = (wethFeeAmount -
                wethAmountToTreasury);

            uint256 wethBalanceOfTreasuryAfterCollect = weth.balanceOf(
                feeCollector.treasury()
            );
            uint256 wethBalanceOfDistributorAfterCollect = weth.balanceOf(
                feeDistributorAddress
            );

            uint256 wethBalanceOfTreasuryDelta = wethBalanceOfTreasuryAfterCollect -
                    wethBalanceOfTreasuryBeforeCollect;
            uint256 wethBalanceOfDistributorDelta = wethBalanceOfDistributorAfterCollect -
                    wethBalanceOfDistributorBeforeCollect;

            assertEq(
                wethBalanceOfTreasuryDelta,
                wethAmountToTreasury,
                "treasury weth not match"
            );

            assertEq(
                wethBalanceOfDistributorDelta,
                wethAmountToDistributor,
                "distributor weth not match"
            );
        }
    }
}
