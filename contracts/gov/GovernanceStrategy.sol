// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IGovernanceStrategy} from "./interfaces/IGovernanceStrategy.sol";
import {
    IGovernancePowerDelegationToken
} from "./interfaces/IGovernancePowerDelegationToken.sol";

/**
 * @title Governance Strategy contract
 * @dev Smart contract containing logic to measure users' relative power to propose and vote.
 * User Power = User Power from Bend Token + User Power from stkBend Token.
 * User Power from Token = Token Power + Token Power as Delegatee [- Token Power if user has delegated]
 * Two wrapper functions linked to Bend Tokens's GovernancePowerDelegationERC20.sol implementation
 * - getPropositionPowerAt: fetching a user Proposition Power at a specified block
 * - getVotingPowerAt: fetching a user Voting Power at a specified block
 * @author Bend
 **/
contract GovernanceStrategy is IGovernanceStrategy {
    address public immutable BEND;
    address public immutable STK_BEND;

    /**
     * @dev Constructor, register tokens used for Voting and Proposition Powers.
     * @param bend The address of the BEND Token contract.
     * @param stkBend The address of the stkBEND Token Contract
     **/
    constructor(address bend, address stkBend) {
        BEND = bend;
        STK_BEND = stkBend;
    }

    /**
     * @dev Returns the total supply of Proposition Tokens Available for Governance
     * = BEND Available for governance      + stkBEND available
     * The supply of BEND staked in stkBEND are not taken into account so:
     * = (Supply of BEND - BEND in stkBEND) + (Supply of stkBEND)
     * = Supply of BEND, Since the supply of stkBEND is equal to the number of BEND staked
     * @param blockNumber Blocknumber at which to evaluate
     * @return total supply at blockNumber
     **/
    function getTotalPropositionSupplyAt(uint256 blockNumber)
        public
        view
        override
        returns (uint256)
    {
        return IGovernancePowerDelegationToken(BEND).totalSupplyAt(blockNumber);
    }

    /**
     * @dev Returns the total supply of Outstanding Voting Tokens
     * @param blockNumber Blocknumber at which to evaluate
     * @return total supply at blockNumber
     **/
    function getTotalVotingSupplyAt(uint256 blockNumber)
        public
        view
        override
        returns (uint256)
    {
        return getTotalPropositionSupplyAt(blockNumber);
    }

    /**
     * @dev Returns the Proposition Power of a user at a specific block number.
     * @param user Address of the user.
     * @param blockNumber Blocknumber at which to fetch Proposition Power
     * @return Power number
     **/
    function getPropositionPowerAt(address user, uint256 blockNumber)
        public
        view
        override
        returns (uint256)
    {
        return
            _getPowerByTypeAt(
                user,
                blockNumber,
                IGovernancePowerDelegationToken.DelegationType.PROPOSITION_POWER
            );
    }

    /**
     * @dev Returns the Vote Power of a user at a specific block number.
     * @param user Address of the user.
     * @param blockNumber Blocknumber at which to fetch Vote Power
     * @return Vote number
     **/
    function getVotingPowerAt(address user, uint256 blockNumber)
        public
        view
        override
        returns (uint256)
    {
        return
            _getPowerByTypeAt(
                user,
                blockNumber,
                IGovernancePowerDelegationToken.DelegationType.VOTING_POWER
            );
    }

    function _getPowerByTypeAt(
        address user,
        uint256 blockNumber,
        IGovernancePowerDelegationToken.DelegationType powerType
    ) internal view returns (uint256) {
        return
            IGovernancePowerDelegationToken(BEND).getPowerAtBlock(
                user,
                blockNumber,
                powerType
            ) +
            IGovernancePowerDelegationToken(STK_BEND).getPowerAtBlock(
                user,
                blockNumber,
                powerType
            );
    }
}
