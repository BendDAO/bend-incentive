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

    address constant feeDistributorAddress =
        0x2338D34337dd0811b684640de74717B73F7B8059;

    FeeCollector feeCollector =
        FeeCollector(0xf3aB1d58Ce6B9E0D42b8958c918649305e1b1d26);
    IBToken bweth = IBToken(0xeD1840223484483C0cb050E6fC344d1eBF0778a9);
    IERC20 weth = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IBToken busdt = IBToken(0x9631C79BfD6123A5B53307B6cdfb35F97606F954);
    IERC20 usdt = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IBendCollector bendCollector = IBendCollector(feeCollector.bendCollector());

    // how to run this testcase
    // forge test -vvv --match-contract FeeCollectorFork0715Test --fork-url https://RPC --fork-block-number xxxxx

    function setUp() public {}

    function testFork_UpgradeFeeCollector() public {
        // upgrading fee collector
        vm.startPrank(timelockControllerAddress);
        ProxyAdmin(proxyAdminAddress).upgrade(
            TransparentUpgradeableProxy(payable(address(feeCollector))),
            address(new FeeCollector())
        );
        vm.stopPrank();

        vm.startPrank(lendingOwnerAddress);
        bendCollector.approve(bweth, address(feeCollector), type(uint256).max);
        bendCollector.approve(busdt, address(feeCollector), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(incentiveOwnerAddress);
        feeCollector.addBToken(address(bweth));
        feeCollector.setTreasuryPercentage(address(weth), 5000);
        feeCollector.addBToken(address(busdt));
        feeCollector.setTreasuryPercentage(address(usdt), 10000);
        vm.stopPrank();

        uint256 bwethAmount = bweth.balanceOf(address(bendCollector));
        console.log("bwethAmount:", bwethAmount);
        uint256 wethAmount = weth.balanceOf(address(feeCollector));
        console.log("wethAmount:", wethAmount);

        wethAmount += bwethAmount;

        // weth
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

        // usdt
        uint256 busdtAmount = busdt.balanceOf(address(bendCollector));
        console.log("busdtAmount:", busdtAmount);
        uint256 usdtAmount = usdt.balanceOf(address(feeCollector));
        console.log("usdtAmount:", usdtAmount);

        usdtAmount += busdtAmount;

        uint256 busdtBalanceOfTreasuryBeforeCollect = busdt.balanceOf(
            feeCollector.treasury()
        );
        uint256 busdtBalanceOfDistributorBeforeCollect = busdt.balanceOf(
            feeDistributorAddress
        );

        uint256 usdtBalanceOfDistributorBeforeCollect = usdt.balanceOf(
            feeDistributorAddress
        );
        uint256 usdtBalanceOfTreasuryBeforeCollect = usdt.balanceOf(
            feeCollector.treasury()
        );

        // collect bweth to distributor
        feeCollector.collect();

        // check results

        // check bweth results
        {
            assertEq(
                bweth.balanceOf(address(feeCollector)),
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

            assertEq(
                busdt.balanceOf(address(feeCollector)),
                0,
                "fee collector busdt delta not zero"
            );

            assertEq(
                busdt.balanceOf(feeCollector.treasury()) -
                    busdtBalanceOfTreasuryBeforeCollect,
                0,
                "treasury busdt delta not zero"
            );

            assertEq(
                busdt.balanceOf(feeDistributorAddress) -
                    busdtBalanceOfDistributorBeforeCollect,
                0,
                "fee distributor busdt delta not zero"
            );
        }

        // check weth results
        {
            uint256 wethAmountToTreasury = wethAmount.percentMul(
                feeCollector.getTreasuryPercentage(address(weth))
            );
            uint256 wethAmountToDistributor = (wethAmount -
                wethAmountToTreasury);

            assertEq(
                weth.balanceOf(address(feeCollector)),
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

            uint256 usdtAmountToTreasury = usdtAmount.percentMul(
                feeCollector.getTreasuryPercentage(address(usdt))
            );
            uint256 usdtAmountToDistributor = (usdtAmount -
                usdtAmountToTreasury);

            assertEq(
                usdt.balanceOf(address(feeCollector)),
                0,
                "treasury usdt not match"
            );

            assertEq(
                usdt.balanceOf(feeCollector.treasury()) -
                    usdtBalanceOfTreasuryBeforeCollect,
                usdtAmountToTreasury,
                "treasury usdt not match"
            );

            assertEq(
                usdt.balanceOf(feeDistributorAddress) -
                    usdtBalanceOfDistributorBeforeCollect,
                usdtAmountToDistributor,
                "distributor usdt not match"
            );
        }
    }
}
