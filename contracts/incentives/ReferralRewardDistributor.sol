// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20Upgradeable, SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {AddressUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IReferralRewardDistributor} from "./interfaces/IReferralRewardDistributor.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract ReferralRewardDistributor is
    IReferralRewardDistributor,
    PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;
    address public override token;
    bool public isMerkleRootSet;
    bytes32 public override merkleRoot;
    mapping(bytes32 => mapping(address => bool)) public claimed;
    mapping(address => uint256) public claimedAmount;
    address public constant TREASURY =
        address(0x472FcC65Fab565f75B1e0E861864A86FE5bcEd7B);

    function initialize(address _token) external initializer {
        __Pausable_init();
        __Ownable_init();
        __ReentrancyGuard_init();
        token = _token;
    }

    function pauseAirdrop() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpauseAirdrop() external onlyOwner whenPaused {
        _unpause();
    }

    /**
     * @notice Set merkle root for airdrop
     * @param _merkleRoot merkle root
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        isMerkleRootSet = true;
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }

    function _isClaimed(bytes32 _merkleRoot, address _account)
        internal
        view
        returns (bool)
    {
        bool _claimed = claimed[_merkleRoot][_account];
        return _claimed;
    }

    function isClaimed(address _account) public view override returns (bool) {
        require(isMerkleRootSet, "MerkleDistributor: Merkle root not set.");
        return _isClaimed(merkleRoot, _account);
    }

    function _setClaimed(bytes32 _merkleRoot, address _account) private {
        claimed[_merkleRoot][_account] = true;
    }

    function claim(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external override whenNotPaused nonReentrant {
        require(
            !account.isContract(),
            "MerkleDistributor: Smart contract claims not allowed."
        );
        require(
            !isClaimed(account),
            "MerkleDistributor: Drop already claimed."
        );

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(
            MerkleProof.verify(merkleProof, merkleRoot, node),
            "MerkleDistributor: Invalid proof."
        );

        // Mark it claimed and send the token.
        _setClaimed(merkleRoot, account);
        claimedAmount[account] += amount;
        IERC20Upgradeable(token).safeTransfer(account, amount);

        emit Claimed(merkleRoot, index, account, amount);
    }

    /**
     * @notice Transfer tokens back
     */
    function withdrawTokenRewards() external override onlyOwner {
        uint256 balanceToWithdraw = IERC20Upgradeable(token).balanceOf(
            address(this)
        );
        IERC20Upgradeable(token).safeTransfer(TREASURY, balanceToWithdraw);

        emit TokensWithdrawn(balanceToWithdraw);
    }
}
