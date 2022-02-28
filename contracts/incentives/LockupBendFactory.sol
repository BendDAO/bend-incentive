// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ILockup} from "./interfaces/ILockup.sol";
import {LockupBend} from "./LockupBend.sol";
import {IVeBend} from "./interfaces/IVeBend.sol";
import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
import {IWETH} from "./interfaces/IWETH.sol";

contract LockupBendFactory is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    event Withdrawn(uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event FeeIndexUpdated(uint256 _index);
    event UserFeeIndexUpdated(address indexed user, uint256 index);

    uint8 public constant PRECISION = 18;
    uint256 public constant SECONDS_IN_ONE_YEAR = 31536000;
    uint256 public constant SECONDS_IN_ONE_DAY = 86400;

    IERC20 public bendToken;
    IVeBend public veBend;
    IFeeDistributor public feeDistributor;

    ILockup[] public lockups;

    mapping(address => uint256) public feeIndexs;
    mapping(address => uint256) public locked;
    uint256 public feeIndex;
    uint256 public feeIndexlastUpdateTimestamp;
    uint256 public totalLocked;

    IWETH internal WETH;

    constructor(
        address _wethAddr,
        address _bendTokenAddr,
        address _veBendAddr,
        address _feeDistributorAddr
    ) {
        WETH = IWETH(_wethAddr);
        bendToken = IERC20(_bendTokenAddr);
        veBend = IVeBend(_veBendAddr);
        feeDistributor = IFeeDistributor(_feeDistributorAddr);
    }

    // internal functions

    function _getFeeIndex() internal view returns (uint256) {
        if (feeIndexlastUpdateTimestamp == block.timestamp) {
            return feeIndex;
        }
        uint256 _claimable = 0;
        for (uint256 i = 0; i < lockups.length; i++) {
            ILockup _lockup = lockups[i];
            _claimable += feeDistributor.claimable(address(_lockup));
        }
        return _getFeeIndex(_claimable);
    }

    function _getFeeIndex(uint256 feeDistributed)
        internal
        view
        returns (uint256)
    {
        if (feeIndexlastUpdateTimestamp == block.timestamp) {
            return feeIndex;
        }
        return
            (feeDistributed * (10**uint256(PRECISION))) /
            totalLocked +
            feeIndex;
    }

    function _updateFeeIndex(uint256 feeDistributed)
        internal
        returns (uint256)
    {
        if (block.timestamp == feeIndexlastUpdateTimestamp) {
            return feeIndex;
        }
        uint256 _newIndex = _getFeeIndex(feeDistributed);
        if (_newIndex != feeIndex) {
            feeIndex = _newIndex;
            emit FeeIndexUpdated(_newIndex);
        }

        feeIndexlastUpdateTimestamp = block.timestamp;

        return _newIndex;
    }

    function _updateUserFeeIndex(address _addr, uint256 feeDistributed)
        internal
        returns (uint256)
    {
        uint256 _userIndex = feeIndexs[_addr];
        uint256 _userLocked = locked[_addr];
        uint256 _newIndex = _updateFeeIndex(feeDistributed);
        uint256 _accruedRewards = 0;
        if (_userIndex != _newIndex) {
            _accruedRewards = _getRewards(_userLocked, _userIndex, _newIndex);
            feeIndexs[_addr] = _newIndex;
            emit UserFeeIndexUpdated(_addr, _newIndex);
        }
        return _accruedRewards;
    }

    function _getRewards(
        uint256 _userTotalLocked,
        uint256 _userFeeIndex,
        uint256 _feeIndex
    ) internal pure returns (uint256) {
        return
            _userTotalLocked *
            ((_feeIndex - _userFeeIndex) / 10**uint256(PRECISION));
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    // external functions

    function transferBeneficiary(
        address _oldBeneficiary,
        address _newBeneficiary
    ) external onlyOwner {
        for (uint256 i = 0; i < lockups.length; i++) {
            ILockup _lockup = lockups[i];
            _lockup.transferBeneficiary(_oldBeneficiary, _newBeneficiary);
        }
    }

    function createLock(
        ILockup.LockParam[] memory _beneficiaries,
        uint256 _totalLockAmount,
        uint256 _lockupYears
    ) external onlyOwner {
        uint256 _bendBalance = bendToken.balanceOf(address(this));
        require(
            _bendBalance > _totalLockAmount,
            "Insufficient Bend for locking"
        );
        require(_lockupYears <= 4, "Maximum lock for four years");
        require(
            lockups.length == 0 && totalLocked == 0,
            "Can't create lock twice"
        );

        totalLocked = _totalLockAmount;

        uint256 _lockAvgAmount = _totalLockAmount / _lockupYears;
        uint256 _unlockStartTime = block.timestamp;

        for (uint256 i = 0; i < _lockupYears; i++) {
            LockupBend _lockupBendContract = new LockupBend(
                address(WETH),
                address(bendToken),
                address(veBend),
                address(feeDistributor)
            );
            lockups[i] = _lockupBendContract;
            bendToken.safeApprove(
                address(_lockupBendContract),
                type(uint256).max
            );
        }
        // The first year is linearly unlocked and not locked in vebend
        lockups[0].createLock(
            _beneficiaries,
            _lockAvgAmount,
            _unlockStartTime,
            false
        );
        // Subsequent annual unlocking from vebend and then linear unlocking to the user for one year
        for (uint256 i = 1; i < _lockupYears - 1; i++) {
            _unlockStartTime += SECONDS_IN_ONE_YEAR;
            lockups[i].createLock(
                _beneficiaries,
                _lockAvgAmount,
                _unlockStartTime,
                true
            );
        }
        _unlockStartTime += SECONDS_IN_ONE_YEAR;
        uint256 _remainingAmount = _totalLockAmount -
            (_lockAvgAmount * (_lockupYears - 1));
        lockups[_lockupYears - 1].createLock(
            _beneficiaries,
            _remainingAmount,
            _unlockStartTime,
            true
        );
    }

    function claimable(address _addr) external view returns (uint256) {
        uint256 _userLocked = locked[_addr];
        uint256 _userFeeIndex = feeIndexs[_addr];
        uint256 _feeIndex = _getFeeIndex();
        return _getRewards(_userLocked, _userFeeIndex, _feeIndex);
    }

    function claim(bool weth) external nonReentrant {
        uint256 balanceBefore = WETH.balanceOf(address(this));
        for (uint256 i = 0; i < lockups.length; i++) {
            ILockup _lockup = lockups[i];
            _lockup.claim();
        }
        uint256 balanceDelta = WETH.balanceOf(address(this)) - balanceBefore;
        uint256 _accruedRewards = _updateUserFeeIndex(msg.sender, balanceDelta);
        if (_accruedRewards > 0) {
            if (weth) {
                assert(WETH.transfer(msg.sender, _accruedRewards));
            } else {
                WETH.withdraw(_accruedRewards);
                _safeTransferETH(msg.sender, _accruedRewards);
            }
            emit Claimed(msg.sender, _accruedRewards);
        }
    }

    function withdrawable(address _addr) external view returns (uint256) {
        uint256 _withdrawAmount = 0;
        for (uint256 i = 0; i < lockups.length; i++) {
            ILockup _lockup = lockups[i];
            _withdrawAmount += _lockup.withdrawable(_addr);
        }
        return _withdrawAmount;
    }

    function withdraw() external {
        for (uint256 i = 0; i < lockups.length; i++) {
            ILockup _lockup = lockups[i];
            _lockup.withdraw(msg.sender);
        }
    }

    function adminWithdraw() external onlyOwner {
        uint256 balanceToWithdraw = bendToken.balanceOf(address(this));
        bendToken.safeTransfer(msg.sender, balanceToWithdraw);
        emit Withdrawn(balanceToWithdraw);
    }
}
