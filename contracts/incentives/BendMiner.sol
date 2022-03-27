// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IERC20Upgradeable, SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC721ReceiverUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import {IMinerNFT} from "./interfaces/IMinerNFT.sol";
import {IMinerNFTRegistry} from "./interfaces/IMinerNFTRegistry.sol";
import {WadRayMath} from "../libs/WadRayMath.sol";

import {ILendPoolAddressesProvider} from "./interfaces/ILendPoolAddressesProvider.sol";
import {ILendPool} from "./interfaces/ILendPool.sol";
import {INFTOracle} from "./interfaces/INFTOracle.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {IWETH} from "./interfaces/IWETH.sol";

import {IBToken} from "./interfaces/IBToken.sol";
import {IDebtBToken} from "./interfaces/IDebtBToken.sol";
import {IBendMiner} from "./interfaces/IBendMiner.sol";

contract BendMiner is
    IBendMiner,
    PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721ReceiverUpgradeable
{
    using WadRayMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    mapping(address => mapping(uint256 => uint256)) public bTokens;
    mapping(address => uint256) public withdrawable;
    IBToken public bToken;
    IDebtBToken public debtBToken;
    ILendPoolAddressesProvider public addressesProvider;
    IWETH public WETH;
    IMinerNFTRegistry public nftRegistry;

    function initialize(
        address _weth,
        address _bToken,
        address _debtBToken,
        address _nftRegistry,
        address _addressesProvider
    ) external initializer {
        __Pausable_init();
        __Ownable_init();
        __ReentrancyGuard_init();
        WETH = IWETH(_weth);
        bToken = IBToken(_bToken);
        debtBToken = IDebtBToken(_debtBToken);
        addressesProvider = ILendPoolAddressesProvider(_addressesProvider);
        nftRegistry = IMinerNFTRegistry(_nftRegistry);
    }

    modifier onlyLendPool() {
        require(
            _msgSender() == address(_getLendPool()),
            "Caller must be lendpool"
        );
        _;
    }

    function redeemNFT(address _nftAsset, uint256 _nftTokenId)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        uint256 _amount = msg.value;
        ILendPool _pool = _getLendPool();

        _burnNFT(msg.sender, _nftAsset, _nftTokenId);

        WETH.deposit{value: _amount}();
        uint256 _ethDeposited = _getTotalBTokenAmount(_nftAsset, _nftTokenId);
        uint256 _wethBalance = WETH.balanceOf(address(this));
        _pool.withdraw(address(WETH), _ethDeposited, address(this));
        uint256 _wethRecieved = WETH.balanceOf(address(this)) - _wethBalance;

        _amount += _wethRecieved;

        (uint256 _paybackAmount, bool _burned) = _pool.repay(
            _nftAsset,
            _nftTokenId,
            _amount
        );
        require(_burned, "msg.value not enough");
        require(
            IERC721Upgradeable(_nftAsset).ownerOf(_nftTokenId) == address(this),
            "Not own nft"
        );

        IERC721Upgradeable(_nftAsset).safeTransferFrom(
            address(this),
            msg.sender,
            _nftTokenId
        );

        if (_paybackAmount > 0) {
            WETH.withdraw(_paybackAmount);
            _safeTransferETH(msg.sender, _paybackAmount);
        }
    }

    function withdrawETH() external whenNotPaused nonReentrant {
        uint256 _amount = withdrawable[msg.sender];
        if (_amount > 0) {
            ILendPool _pool = _getLendPool();
            _pool.withdraw(address(WETH), _amount, msg.sender);
        }
    }

    function repayETH(address _nftAsset, uint256 _nftTokenId)
        external
        payable
        whenNotPaused
        nonReentrant
    {
        uint256 _amount = msg.value;
        ILendPool _pool = _getLendPool();

        WETH.deposit{value: _amount}();

        uint256 _paybackAmount = _pool.redeem(_nftAsset, _nftTokenId, _amount);

        if (_paybackAmount > 0) {
            WETH.withdraw(_paybackAmount);
            _safeTransferETH(msg.sender, _paybackAmount);
        }
    }

    function stakeNFT(address _nftAsset, uint256 _nftTokenId)
        external
        whenNotPaused
        nonReentrant
    {
        ILendPool _pool = _getLendPool();
        // recieve sender's nft
        IERC721Upgradeable(_nftAsset).safeTransferFrom(
            msg.sender,
            address(this),
            _nftTokenId
        );

        (, , uint256 availableBorrowsInETH, , , , ) = _pool
            .getNftCollateralData(_nftAsset, address(WETH));

        uint256 _wethBalance = WETH.balanceOf(address(this));
        // borrow max weth
        _pool.borrow(
            address(WETH),
            availableBorrowsInETH,
            _nftAsset,
            _nftTokenId,
            address(this),
            0
        );

        uint256 _wethRecieved = WETH.balanceOf(address(this)) - _wethBalance;

        uint256 _scaledBTokenBalance = bToken.scaledBalanceOf(address(this));

        // deposit borrowed weth
        _pool.deposit(address(WETH), _wethRecieved, address(this), 0);

        uint256 _scaledBTokenRecieved = debtBToken.scaledBalanceOf(
            address(this)
        ) - _scaledBTokenBalance;

        bTokens[_nftAsset][_nftTokenId] = _scaledBTokenRecieved;

        _mintNFT(msg.sender, _nftAsset, _nftTokenId);
    }

    function preCheckAuction(
        address _nftAsset,
        uint256 _nftTokenId,
        uint256 bidPrice,
        address onBehalfOf
    ) external view override onlyLendPool returns (bool) {
        uint256 _nftPriceInEth = _getNFTOracle().getAssetPrice(_nftAsset);
        uint256 _ethDeposited = _getTotalBTokenAmount(_nftAsset, _nftTokenId);
        uint256 _ethBorrowed = _getTotalDebtBTokenAmount(
            _nftAsset,
            _nftTokenId
        );
        return (_nftPriceInEth + _ethDeposited) >= _ethBorrowed;
    }

    function postHandleLiquidate(
        address _nftAsset,
        uint256 _nftTokenId,
        uint256 amount
    ) external override onlyLendPool {
        uint256 _ethBorrowed = _getTotalDebtBTokenAmount(
            _nftAsset,
            _nftTokenId
        );
        require(_ethBorrowed == 0, "Borrowings not repaid");
        address _proxy = nftRegistry.getNFTAddress(_nftAsset);
        uint256 _totalDepisted = _getTotalBTokenAmount(_nftAsset, _nftTokenId);
        address _nftOwner = IMinerNFT(_proxy).ownerOf(_nftTokenId);
        withdrawable[_nftOwner] += _totalDepisted;
        // burn bnft
        IMinerNFT(_proxy).burn(_nftTokenId);
    }

    // internal functions
    function _mintNFT(
        address _to,
        address _nftAsset,
        uint256 _nftTokenId
    ) internal {
        address _proxy = nftRegistry.getNFTAddress(_nftAsset);
        IMinerNFT(_proxy).mint(_to, _nftTokenId);
    }

    function _burnNFT(
        address _from,
        address _nftAsset,
        uint256 _nftTokenId
    ) internal {
        address _proxy = nftRegistry.getNFTAddress(_nftAsset);
        require(
            IMinerNFT(_proxy).ownerOf(_nftTokenId) == _from,
            "Not the owner"
        );
        IMinerNFT(_proxy).burn(_nftTokenId);
    }

    function _getNFTOracle() internal view returns (INFTOracle) {
        return INFTOracle(addressesProvider.getNFTOracle());
    }

    function _getLendPool() internal view returns (ILendPool) {
        return ILendPool(addressesProvider.getLendPool());
    }

    /**
     * @dev transfer ETH to an address, revert if it fails.
     * @param to recipient of the transfer
     * @param value the amount to send
     */
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "ETH_TRANSFER_FAILED");
    }

    function _getTotalDebtBTokenAmount(address _nftAsset, uint256 _nftTokenId)
        internal
        view
        returns (uint256)
    {
        (, , , uint256 _totalDebt, , ) = _getLendPool().getNftDebtData(
            _nftAsset,
            _nftTokenId
        );
        return _totalDebt;
    }

    function _getTotalBTokenAmount(address _nftAsset, uint256 _nftTokenId)
        internal
        view
        returns (uint256)
    {
        return
            bTokens[_nftAsset][_nftTokenId].rayMul(
                _getLendPool().getReserveNormalizedIncome(address(WETH))
            );
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        tokenId;
        data;
        return IERC721ReceiverUpgradeable.onERC721Received.selector;
    }

    /**
     * @dev Only WETH contract is allowed to transfer ETH here. Prevent other addresses to send Ether to this contract.
     */
    receive() external payable {
        require(msg.sender == address(WETH), "Receive not allowed");
    }

    /**
     * @dev Revert fallback calls
     */
    fallback() external payable {
        revert("Fallback not allowed");
    }
}
