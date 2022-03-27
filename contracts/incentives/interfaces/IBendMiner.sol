// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

interface IBendMiner {
    function preCheckAuction(
        address nftAsset,
        uint256 nftTokenId,
        uint256 bidPrice,
        address onBehalfOf
    ) external returns (bool);

    function postHandleLiquidate(
        address nftAsset,
        uint256 nftTokenId,
        uint256 amount
    ) external;
}
