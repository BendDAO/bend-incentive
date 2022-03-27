// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

interface ILendPool {
    /**
     * @dev Withdraws an `amount` of underlying asset from the reserve, burning the equivalent bTokens owned
     * E.g. User has 100 bUSDC, calls withdraw() and receives 100 USDC, burning the 100 bUSDC
     * @param reserve The address of the underlying asset to withdraw
     * @param amount The underlying amount to be withdrawn
     *   - Send the value type(uint256).max in order to withdraw the whole bToken balance
     * @param to Address that will receive the underlying, same as msg.sender if the user
     *   wants to receive it on his own wallet, or a different address if the beneficiary is a
     *   different wallet
     * @return The final amount withdrawn
     **/
    function withdraw(
        address reserve,
        uint256 amount,
        address to
    ) external returns (uint256);

    /**
     * @notice Redeem a NFT loan which state is in Auction
     * - E.g. User repays 100 USDC, burning loan and receives collateral asset
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token ID of the underlying NFT used as collateral
     * @param amount The amount to repay the debt and bid fine
     **/
    function redeem(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external returns (uint256);

    /**
     * @notice Repays a borrowed `amount` on a specific reserve, burning the equivalent loan owned
     * - E.g. User repays 100 USDC, burning loan and receives collateral asset
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token ID of the underlying NFT used as collateral
     * @param amount The amount to repay
     * @return The final amount repaid, loan is burned or not
     **/
    function repay(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external returns (uint256, bool);

    /**
     * @dev Allows users to borrow a specific `amount` of the reserve underlying asset, provided that the borrower
     * already deposited enough collateral
     * - E.g. User borrows 100 USDC, receiving the 100 USDC in his wallet
     *   and lock collateral asset in contract
     * @param reserveAsset The address of the underlying asset to borrow
     * @param amount The amount to be borrowed
     * @param nftAsset The address of the underlying NFT used as collateral
     * @param nftTokenId The token ID of the underlying NFT used as collateral
     * @param onBehalfOf Address of the user who will receive the loan. Should be the address of the borrower itself
     * calling the function if he wants to borrow against his own collateral, or the address of the credit delegator
     * if he has been given credit delegation allowance
     * @param referralCode Code used to register the integrator originating the operation, for potential rewards.
     *   0 if the action is executed directly by the user, without any middle-man
     **/
    function borrow(
        address reserveAsset,
        uint256 amount,
        address nftAsset,
        uint256 nftTokenId,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @dev Deposits an `amount` of underlying asset into the reserve, receiving in return overlying bTokens.
     * - E.g. User deposits 100 USDC and gets in return 100 bUSDC
     * @param reserve The address of the underlying asset to deposit
     * @param amount The amount to be deposited
     * @param onBehalfOf The address that will receive the bTokens, same as msg.sender if the user
     *   wants to receive them on his own wallet, or a different address if the beneficiary of bTokens
     *   is a different wallet
     * @param referralCode Code used to register the integrator originating the operation, for potential rewards.
     *   0 if the action is executed directly by the user, without any middle-man
     **/
    function deposit(
        address reserve,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @dev Returns the loan data of the NFT
     * @param nftAsset The address of the NFT
     * @param reserveAsset The address of the Reserve
     * @return totalCollateralInETH the total collateral in ETH of the NFT
     * @return totalCollateralInReserve the total collateral in Reserve of the NFT
     * @return availableBorrowsInETH the borrowing power in ETH of the NFT
     * @return availableBorrowsInReserve the borrowing power in Reserve of the NFT
     * @return ltv the loan to value of the user
     * @return liquidationThreshold the liquidation threshold of the NFT
     * @return liquidationBonus the liquidation bonus of the NFT
     **/
    function getNftCollateralData(address nftAsset, address reserveAsset)
        external
        view
        returns (
            uint256 totalCollateralInETH,
            uint256 totalCollateralInReserve,
            uint256 availableBorrowsInETH,
            uint256 availableBorrowsInReserve,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus
        );

    /**
     * @dev Returns the debt data of the NFT
     * @param nftAsset The address of the NFT
     * @param nftTokenId The token id of the NFT
     * @return loanId the loan id of the NFT
     * @return reserveAsset the address of the Reserve
     * @return totalCollateral the total power of the NFT
     * @return totalDebt the total debt of the NFT
     * @return availableBorrows the borrowing power left of the NFT
     * @return healthFactor the current health factor of the NFT
     **/
    function getNftDebtData(address nftAsset, uint256 nftTokenId)
        external
        view
        returns (
            uint256 loanId,
            address reserveAsset,
            uint256 totalCollateral,
            uint256 totalDebt,
            uint256 availableBorrows,
            uint256 healthFactor
        );

    /**
     * @dev Returns the normalized income normalized income of the reserve
     * @param asset The address of the underlying asset of the reserve
     * @return The reserve's normalized income
     */
    function getReserveNormalizedIncome(address asset)
        external
        view
        returns (uint256);
}
