// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IFeeDistributor {
    event Checkpoint(uint256 time, uint256 tokenAmount);

    event Claimed(
        address indexed recipient,
        uint256 amount,
        uint256 claimEpoch,
        uint256 maxEpoch
    );

    function start() external;

    function claim(bool weth) external returns (uint256);

    function claimable(address _addr) external view returns (uint256);
}
