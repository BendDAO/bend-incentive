// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

/************
@title INFTOracle interface
@notice Interface for NFT price oracle.*/
interface INFTOracle {
    /* CAUTION: Price uint is ETH based (WEI, 18 decimals) */
    // get latest price
    function getAssetPrice(address _asset) external view returns (uint256);
}
