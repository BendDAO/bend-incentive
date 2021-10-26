// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

function getChainId() view returns (uint256) {
    uint256 chainId;
    assembly {
        chainId := chainid()
    }
    return chainId;
}
