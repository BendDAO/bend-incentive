// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {
    SafeERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {DistributionTypes} from "./DistributionTypes.sol";

import {DistributionManager} from "./DistributionManager.sol";

import {IStakedTokenWithConfig} from "./interfaces/IStakedTokenWithConfig.sol";
import {
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IScaledBalanceToken} from "./interfaces/IScaledBalanceToken.sol";
import {IIncentivesController} from "./interfaces/IIncentivesController.sol";

/**
 * @title StakedTokenIncentivesController
 * @notice Distributor contract for rewards to the Aave protocol, using a staked token as rewards asset.
 * The contract stakes the rewards before redistributing them to the Aave protocol participants.
 * The reference staked token implementation is at https://github.com/aave/aave-stake-v2
 * @author Aave
 **/
contract StakedTokenIncentivesController is
    IIncentivesController,
    DistributionManager
{
    using SafeMath for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IStakedTokenWithConfig public STAKE_TOKEN;

    mapping(address => uint256) internal _usersUnclaimedRewards;

    // this mapping allows whitelisted addresses to claim on behalf of others
    // useful for contracts that hold tokens to be rewarded but don't have any native logic to claim Liquidity Mining rewards
    mapping(address => address) internal _authorizedClaimers;

    modifier onlyAuthorizedClaimers(address claimer, address user) {
        require(_authorizedClaimers[user] == claimer, "CLAIMER_UNAUTHORIZED");
        _;
    }

    function initialize(
        IStakedTokenWithConfig stakeToken,
        address emissionManager
    ) public initializer {
        __DistributionManager_init(emissionManager);
        STAKE_TOKEN = stakeToken;
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
            assetsConfig[i].emissionPerSecond = uint104(emissionsPerSecond[i]);

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
    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        require(to != address(0), "INVALID_TO_ADDRESS");
        return _claimRewards(assets, amount, msg.sender, msg.sender, to);
    }

    /// @inheritdoc IIncentivesController
    function claimRewardsOnBehalf(
        address[] calldata assets,
        uint256 amount,
        address user,
        address to
    )
        external
        override
        onlyAuthorizedClaimers(msg.sender, user)
        returns (uint256)
    {
        require(user != address(0), "INVALID_USER_ADDRESS");
        require(to != address(0), "INVALID_TO_ADDRESS");
        return _claimRewards(assets, amount, msg.sender, user, to);
    }

    /**
     * @dev Claims reward for an user on behalf, on all the assets of the lending pool, accumulating the pending rewards.
     * @param amount Amount of rewards to claim
     * @param user Address to check and claim rewards
     * @param to Address that will be receiving the rewards
     * @return Rewards claimed
     **/

    /// @inheritdoc IIncentivesController
    function setClaimer(address user, address caller)
        external
        override
        onlyEmissionManager
    {
        _authorizedClaimers[user] = caller;
        emit ClaimerSet(user, caller);
    }

    /// @inheritdoc IIncentivesController
    function getClaimer(address user) external view override returns (address) {
        return _authorizedClaimers[user];
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

    /// @inheritdoc IIncentivesController
    function REWARD_TOKEN() external view override returns (address) {
        return address(STAKE_TOKEN);
    }

    /**
     * @dev Claims reward for an user on behalf, on all the assets of the lending pool, accumulating the pending rewards.
     * @param amount Amount of rewards to claim
     * @param user Address to check and claim rewards
     * @param to Address that will be receiving the rewards
     * @return Rewards claimed
     **/
    function _claimRewards(
        address[] calldata assets,
        uint256 amount,
        address claimer,
        address user,
        address to
    ) internal returns (uint256) {
        if (amount == 0) {
            return 0;
        }
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

        STAKE_TOKEN.stake(to, amountToClaim);
        emit RewardsClaimed(user, to, claimer, amountToClaim);

        return amountToClaim;
    }
}
