// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
pragma abicoder v2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TokenVesting is Ownable {
    using SafeERC20 for IERC20;

    uint8 public constant PRECISION = 10;

    IERC20 public token;
    uint256 public totalAmount;
    address public benificiary;
    uint40 public startTime;
    uint40 public endTime;
    uint256 public slope;

    constructor(
        address token_,
        uint256 totalAmount_,
        address benificiary_,
        uint40 startTime_,
        uint40 endTime_
    ) {
        token = IERC20(token_);
        totalAmount = totalAmount_;

        benificiary = benificiary_;
        startTime = startTime_;
        endTime = endTime_;

        _updateSlope();
    }

    function claimable() public view returns (uint256) {
        if (block.timestamp <= startTime) {
            return 0;
        }

        if (block.timestamp >= endTime) {
            return token.balanceOf(address(this));
        }

        return (slope * (block.timestamp - startTime)) / 10**PRECISION;
    }

    function claim() public {
        require(
            (msg.sender == benificiary) || (msg.sender == owner()),
            "invalid caller"
        );

        uint256 _value = claimable();
        if (_value > 0) {
            token.safeTransfer(benificiary, _value);
        }
    }

    function withdraw() public onlyOwner {
        uint256 _value = token.balanceOf(address(this));
        if (_value > 0) {
            token.safeTransfer(owner(), _value);
        }
    }

    function changeAmount(uint256 totalAmount_) public onlyOwner {
        totalAmount = totalAmount_;

        _updateSlope();
    }

    function changeTime(uint40 startTime_, uint40 endTime_) public onlyOwner {
        startTime = startTime_;
        endTime = endTime_;

        _updateSlope();
    }

    function changeBenificiary(address benificiary_) public onlyOwner {
        benificiary = benificiary_;
    }

    function _updateSlope() private {
        slope = (totalAmount * 10**PRECISION) / (endTime - startTime);
    }
}
