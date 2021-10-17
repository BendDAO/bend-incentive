// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {
    SafeERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {DistributionTypes} from "../stake/DistributionTypes.sol";

import {DistributionManager} from "../stake/DistributionManager.sol";

import {IStakedTokenWithConfig} from "./interfaces/IStakedTokenWithConfig.sol";
import {
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import {IScaledBalanceToken} from "./interfaces/IScaledBalanceToken.sol";
import {IIncentivesController} from "./interfaces/IIncentivesController.sol";

/**
 * @title StakedTokenIncentivesController
 * @notice Distributor contract for rewards to the Bend protocol, using a staked token as rewards asset.
 * The contract stakes the rewards before redistributing them to the Bend protocol participants.
 * @author Bend
 **/
contract StakedTokenIncentivesController is
    IIncentivesController,
    DistributionManager
{
    using SafeMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IStakedTokenWithConfig public STAKE_TOKEN;
    IERC20Upgradeable public REWARD_TOKEN;
    address public REWARDS_VAULT;

    mapping(address => uint256) internal _usersUnclaimedRewards;

    function initialize(
        IStakedTokenWithConfig stakeToken,
        address rewardsVault,
        address emissionManager,
        uint128 distributionDuration
    ) public initializer {
        __DistributionManager_init(emissionManager, distributionDuration);
        STAKE_TOKEN = stakeToken;
        REWARD_TOKEN = IERC20Upgradeable(stakeToken);
        REWARDS_VAULT = rewardsVault;
        //approves the safety module to allow staking
        IERC20Upgradeable(STAKE_TOKEN.STAKED_TOKEN()).safeApprove(
            address(STAKE_TOKEN),
            type(uint256).max
        );
    }

    /// @inheritdoc IIncentivesController
    function configureAssets(
        address[] calldata assets,
        uint256[] calldata emissionsPerSecond
    ) external override onlyEmissionManager {
        require(
            assets.length == emissionsPerSecond.length,
            "INVALID_CONFIGURATION"
        );

        DistributionTypes.AssetConfigInput[] memory assetsConfig =
            new DistributionTypes.AssetConfigInput[](assets.length);

        for (uint256 i = 0; i < assets.length; i++) {
            assetsConfig[i].underlyingAsset = assets[i];
            assetsConfig[i].emissionPerSecond = uint128(emissionsPerSecond[i]);

            require(
                assetsConfig[i].emissionPerSecond == emissionsPerSecond[i],
                "INVALID_CONFIGURATION"
            );

            assetsConfig[i].totalStaked = IScaledBalanceToken(assets[i])
                .scaledTotalSupply();
        }
        _configureAssets(assetsConfig);
    }

    /// @inheritdoc IIncentivesController
    function handleAction(
        address user,
        uint256 totalSupply,
        uint256 userBalance
    ) external override {
        uint256 accruedRewards =
            _updateUserAssetInternal(
                user,
                msg.sender,
                userBalance,
                totalSupply
            );
        if (accruedRewards != 0) {
            _usersUnclaimedRewards[user] = _usersUnclaimedRewards[user].add(
                accruedRewards
            );
            emit RewardsAccrued(user, accruedRewards);
        }
    }

    /// @inheritdoc IIncentivesController
    function getRewardsBalance(address[] calldata assets, address user)
        external
        view
        override
        returns (uint256)
    {
        uint256 unclaimedRewards = _usersUnclaimedRewards[user];

        DistributionTypes.UserStakeInput[] memory userState =
            new DistributionTypes.UserStakeInput[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            userState[i].underlyingAsset = assets[i];
            (
                userState[i].stakedByUser,
                userState[i].totalStaked
            ) = IScaledBalanceToken(assets[i]).getScaledUserBalanceAndSupply(
                user
            );
        }
        unclaimedRewards = unclaimedRewards.add(
            _getUnclaimedRewards(user, userState)
        );
        return unclaimedRewards;
    }

    /// @inheritdoc IIncentivesController
    function getUserUnclaimedRewards(address _user)
        external
        view
        override
        returns (uint256)
    {
        return _usersUnclaimedRewards[_user];
    }

    /**
     * @dev Claims reward for an user, on all the assets of the lending pool, accumulating the pending rewards
     * @param amount Amount of rewards to claim
     * @param to Address that will be receiving the rewards
     * @return Rewards claimed
     **/
    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        address user = msg.sender;
        uint256 unclaimedRewards = _usersUnclaimedRewards[user];

        DistributionTypes.UserStakeInput[] memory userState =
            new DistributionTypes.UserStakeInput[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            userState[i].underlyingAsset = assets[i];
            (
                userState[i].stakedByUser,
                userState[i].totalStaked
            ) = IScaledBalanceToken(assets[i]).getScaledUserBalanceAndSupply(
                user
            );
        }

        uint256 accruedRewards = _claimRewards(user, userState);
        if (accruedRewards != 0) {
            unclaimedRewards = unclaimedRewards.add(accruedRewards);
            emit RewardsAccrued(user, accruedRewards);
        }

        if (unclaimedRewards == 0) {
            return 0;
        }

        uint256 amountToClaim =
            amount > unclaimedRewards ? unclaimedRewards : amount;
        _usersUnclaimedRewards[user] = unclaimedRewards - amountToClaim; // Safe due to the previous line

        IERC20Upgradeable(STAKE_TOKEN).safeTransferFrom(
            REWARDS_VAULT,
            address(this),
            amountToClaim
        );
        STAKE_TOKEN.stake(to, amountToClaim);

        emit RewardsClaimed(msg.sender, to, amountToClaim);

        return amountToClaim;
    }
}
