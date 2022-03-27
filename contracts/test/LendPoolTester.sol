// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
import {ILendPool} from "../incentives/interfaces/ILendPool.sol";
import {IBToken} from "./IBToken.sol";

contract LendPoolTester is ILendPool {
    mapping(address => address) internal _reserves;

    function registerReserve(address _reverve, address _underlying) external {
        _reserves[_underlying] = _reverve;
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        IBToken(_reserves[asset]).burn(msg.sender, to, amount, 0);
        return amount;
    }

    function redeem(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external override returns (uint256) {
        return 0;
    }

    function repay(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external override returns (uint256, bool) {
        return (0, false);
    }

    function borrow(
        address reserveAsset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf,
        uint16 referralCode
    ) external override {}

    function deposit(
        address reserve,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external override {}

    function getNftCollateralData(address nftAsset, address reserveAsset)
        external
        view
        override
        returns (
            uint256 totalCollateralInETH,
            uint256 totalCollateralInReserve,
            uint256 availableBorrowsInETH,
            uint256 availableBorrowsInReserve,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus
        )
    {
        return (0, 0, 0, 0, 0, 0, 0);
    }

    function getNftDebtData(address nftAsset, uint256 nftTokenId)
        external
        view
        override
        returns (
            uint256 loanId,
            address reserveAsset,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 availableBorrows,
            uint256 healthFactor
        )
    {
        return (0, 0x0000000000000000000000000000000000000000, 0, 0, 0, 0);
    }

    function getReserveNormalizedIncome(address asset)
        external
        view
        override
        returns (uint256)
    {
        return 0;
    }
}
