// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {PercentageMath} from "../libs/PercentageMath.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IFeeCollector} from "./interfaces/IFeeCollector.sol";
import {ILendPoolAddressesProvider} from "./interfaces/ILendPoolAddressesProvider.sol";
import {ILendPool} from "./interfaces/ILendPool.sol";

contract FeeCollector is IFeeCollector, Initializable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using PercentageMath for uint256;
    IWETH public WETH;
    IERC20Upgradeable public BWETH;
    uint256 public treasuryPercentage;
    address public treasury;
    address public bendCollector;
    ILendPoolAddressesProvider public bendAddressesProvider;
    address public feeDistributor;

    function initialize(
        IWETH _weth,
        IERC20Upgradeable _bweth,
        address _treasury,
        address _bendCollector,
        ILendPoolAddressesProvider _bendAddressesProvider
    ) external initializer {
        __Ownable_init();
        WETH = _weth;
        BWETH = _bweth;
        treasury = _treasury;
        bendCollector = _bendCollector;
        bendAddressesProvider = _bendAddressesProvider;
        WETH.approve(_bendAddressesProvider.getLendPool(), type(uint256).max);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(
            _treasury != address(0),
            "FeeCollector: treasury can't be null"
        );
        treasury = _treasury;
    }

    function setBendCollector(address _bendCollector) external onlyOwner {
        require(
            _bendCollector != address(0),
            "FeeCollector: bendCollector can't be null"
        );
        bendCollector = _bendCollector;
    }

    function setFeeDistributor(address _feeDistributor) external onlyOwner {
        require(
            _feeDistributor != address(0),
            "FeeCollector: feeDistributor can't be null"
        );
        feeDistributor = _feeDistributor;
    }

    function setTreasuryPercentage(uint256 _treasuryPercentage)
        external
        onlyOwner
    {
        require(
            _treasuryPercentage <= PercentageMath.PERCENTAGE_FACTOR,
            "FeeCollector: treasury percentage overflow"
        );
        treasuryPercentage = _treasuryPercentage;
    }

    function collect() external override {
        _collectToken(BWETH);

        _collectToken(IERC20Upgradeable(address(WETH)));
    }

    function _collectToken(IERC20Upgradeable _token) internal {
        require(
            feeDistributor != address(0),
            "FeeCollector: feeDistributor can't be null"
        );
        require(treasury != address(0), "FeeCollector: treasury can't be null");

        uint256 _toDistribute = _token.balanceOf(address(this));
        if (_toDistribute == 0) {
            return;
        }

        uint256 _toTreasury = _toDistribute.percentMul(treasuryPercentage);
        if (_toTreasury > 0) {
            _token.safeTransfer(treasury, _toTreasury);
        }

        uint256 _toFeeDistributor = _toDistribute - _toTreasury;
        if (_toFeeDistributor > 0) {
            _token.safeTransfer(feeDistributor, _toFeeDistributor);
        }
    }
}
