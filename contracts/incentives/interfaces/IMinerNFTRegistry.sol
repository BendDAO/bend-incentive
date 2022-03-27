// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

interface IMinerNFTRegistry {
    function getNFTAddress(address _underlyingNftAsset)
        external
        view
        returns (address);

    function upgradeBNFT(
        address _underlyingNftAsset,
        address _newImpl,
        bytes calldata _encoded
    ) external;
}
