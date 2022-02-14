// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IVeBend {
    struct Point {
        int256 bias;
        int256 slope;
        uint256 ts;
        uint256 blk;
    }

    function userPointEpoch(address _userAddress)
        external
        view
        returns (uint256);

    function epoch() external view returns (uint256);

    function userPointHistory(address _userAddress, uint256 _index)
        external
        view
        returns (Point memory);

    function supplyPointHistory(uint256 _index)
        external
        view
        returns (Point memory);

    function checkpointSupply() external;
}
