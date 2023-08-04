// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import "forge-std/Test.sol";

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../contracts/incentives/interfaces/IWETH.sol";
import "../../contracts/incentives/interfaces/IBToken.sol";
import "../../contracts/incentives/interfaces/IBendCollector.sol";
import "../../contracts/incentives/FeeCollector.sol";
import "../../contracts/incentives/FeeDistributor.sol";
import "../../contracts/libs/PercentageMath.sol";

contract FeeCollectorForkTest is Test {
    using PercentageMath for uint256;

    // the address of the contract on the mainnet fork
    address constant lendingOwnerAddress =
        0x652DB942BE3Ab09A8Fd6F14776a52ed2A73bF214;
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
    address constant BWETH = 0xeD1840223484483C0cb050E6fC344d1eBF0778a9;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // how to run this testcase
    // forge test -vvv --match-contract FeeCollectorFork0715Test --fork-url https://RPC --fork-block-number xxxxx

    function setUp() public {}

    function testFork_UpgradeFeeCollector() public {
        // upgrading fee collector
        ProxyAdmin proxyAdmin = ProxyAdmin(proxyAdminAddress);

        TransparentUpgradeableProxy feeCollectorProxy = TransparentUpgradeableProxy(
                payable(feeCollectorAddress)
            );
        FeeCollector feeCollectorImpl = new FeeCollector();
        vm.startPrank(timelockControllerAddress);
        proxyAdmin.upgrade(feeCollectorProxy, address(feeCollectorImpl));
        vm.stopPrank();

        FeeCollector feeCollector = FeeCollector(payable(feeCollectorAddress));
        IBToken bweth = IBToken(BWETH);
        IERC20 weth = IERC20(WETH);
        IBendCollector bendCollector = IBendCollector(
            feeCollector.bendCollector()
        );
        vm.startPrank(lendingOwnerAddress);
        bendCollector.approve(bweth, feeCollectorAddress, type(uint256).max);
        vm.stopPrank();

        vm.startPrank(incentiveOwnerAddress);
        feeCollector.addBToken(BWETH);
        feeCollector.setTreasuryPercentage(WETH, 5000);
        vm.stopPrank();

        uint256 bwethAmount = bweth.balanceOf(address(bendCollector));
        console.log("bwethAmount:", bwethAmount);
        uint256 wethAmount = weth.balanceOf(feeCollectorAddress);
        console.log("wethAmount:", wethAmount);

        wethAmount += bwethAmount;

        uint256 bwethBalanceOfTreasuryBeforeCollect = bweth.balanceOf(
            feeCollector.treasury()
        );
        uint256 bwethBalanceOfDistributorBeforeCollect = bweth.balanceOf(
            feeDistributorAddress
        );

        uint256 wethBalanceOfDistributorBeforeCollect = weth.balanceOf(
            feeDistributorAddress
        );
        uint256 wethBalanceOfTreasuryBeforeCollect = weth.balanceOf(
            feeCollector.treasury()
        );

        // collect bweth to distributor
        feeCollector.collect();

        // check results

        // check bweth results
        {
            assertEq(
                bweth.balanceOf(feeCollectorAddress),
                0,
                "fee collector bweth delta not zero"
            );

            assertEq(
                bweth.balanceOf(feeCollector.treasury()) -
                    bwethBalanceOfTreasuryBeforeCollect,
                0,
                "treasury bweth delta not zero"
            );

            assertEq(
                bweth.balanceOf(feeDistributorAddress) -
                    bwethBalanceOfDistributorBeforeCollect,
                0,
                "fee distributor bweth delta not zero"
            );
        }

        // check weth results
        {
            uint256 wethAmountToTreasury = wethAmount.percentMul(
                feeCollector.getTreasuryPercentage(WETH)
            );
            uint256 wethAmountToDistributor = (wethAmount -
                wethAmountToTreasury);

            assertEq(
                weth.balanceOf(feeCollectorAddress),
                0,
                "treasury weth not match"
            );

            assertEq(
                weth.balanceOf(feeCollector.treasury()) -
                    wethBalanceOfTreasuryBeforeCollect,
                wethAmountToTreasury,
                "treasury weth not match"
            );

            assertEq(
                weth.balanceOf(feeDistributorAddress) -
                    wethBalanceOfDistributorBeforeCollect,
                wethAmountToDistributor,
                "distributor weth not match"
            );
        }
    }
}
