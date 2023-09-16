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

contract FeeCollectorFork230903Test is Test {
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

    address constant feeDistributorAddress =
        0x2338D34337dd0811b684640de74717B73F7B8059;

    FeeCollector feeCollector =
        FeeCollector(0xf3aB1d58Ce6B9E0D42b8958c918649305e1b1d26);
    FeeDistributor feeDistributor =
        FeeDistributor(payable(0x2338D34337dd0811b684640de74717B73F7B8059));
    IBToken bweth = IBToken(0xeD1840223484483C0cb050E6fC344d1eBF0778a9);
    IERC20 weth = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IBToken busdt = IBToken(0x9631C79BfD6123A5B53307B6cdfb35F97606F954);
    IERC20 usdt = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    // how to run this testcase
    // RPC: https://eth-mainnet.g.alchemy.com/v2/${APIKEY}
    // forge test -vvv --match-contract FeeCollectorFork230903Test --fork-url https://RPC --fork-block-number 18052540

    function setUp() public {}

    function testFork_UpgradeFeeCollector() public {
        // upgrading fee collector
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(feeCollector))),
            address(new FeeCollector())
        );
        vm.stopPrank();

        // upgrading fee collector
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(feeDistributor))),
            address(new FeeDistributor())
        );
        vm.stopPrank();

        // init the total transferred
        vm.startPrank(incentiveOwnerAddress);
        feeCollector.setTreasuryTotalTransferred(
            address(weth),
            1541311284248192900
        );
        vm.stopPrank();

        // init the total distributed
        vm.startPrank(incentiveOwnerAddress);
        feeDistributor.setTotalDistributedBalance(1799408802035385316844);
        vm.stopPrank();

        uint256 wethTreasuryTotalTransferredBeforeCollect = feeCollector
            .getTreasuryTotalTransferred(address(weth));

        uint256 wethTotalDistributedBeforeCollect = feeDistributor
            .getTotalDistributedBalance();

        // collect bweth to distributor
        feeCollector.collect();
        feeDistributor.distribute();

        // check results
        {
            uint256 wethTreasuryTotalTransferredAfterCollect = feeCollector
                .getTreasuryTotalTransferred(address(weth));
            console.log(
                "weth total treasury:",
                wethTreasuryTotalTransferredBeforeCollect,
                wethTreasuryTotalTransferredAfterCollect
            );

            assertGt(
                wethTreasuryTotalTransferredAfterCollect,
                wethTreasuryTotalTransferredBeforeCollect,
                "weth treasury not match"
            );
        }
        {
            uint256 wethTotalDistributedAfterCollect = feeDistributor
                .getTotalDistributedBalance();

            console.log(
                "weth total distributed:",
                wethTotalDistributedBeforeCollect,
                wethTotalDistributedAfterCollect
            );

            assertGt(
                wethTotalDistributedAfterCollect,
                wethTotalDistributedBeforeCollect,
                "weth total distributed not match"
            );
        }
        {
            uint256 endWeekTime = block.timestamp + 7 days;
            uint256 startWeekTime = endWeekTime - 30 days;
            uint256 wethWeekDistributedAfterCollect = feeDistributor
                .getWeekDistributedBalance(startWeekTime, endWeekTime);
            console.log(
                "weth week distributed:",
                wethWeekDistributedAfterCollect
            );

            assertGt(
                wethWeekDistributedAfterCollect,
                0,
                "weth week distributed not match"
            );
        }
    }
}
