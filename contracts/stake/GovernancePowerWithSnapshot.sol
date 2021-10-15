// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import {ITransferHook} from "../gov/interfaces/ITransferHook.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {
    GovernancePowerDelegationERC20
} from "../token/GovernancePowerDelegationERC20.sol";

/**
 * @title ERC20WithSnapshot,.
 * @notice ERC20 including snapshots of balances on transfer-related actions
 * @author Bend
 **/
abstract contract GovernancePowerWithSnapshot is
    GovernancePowerDelegationERC20
{
    using SafeMath for uint256;

    /**
     * @dev The following storage layout points to the prior StakedToken.sol implementation:
     * _snapshots => _votingSnapshots
     * _snapshotsCounts =>  _votingSnapshotsCounts
     * _bendGovernance => _bendGovernance
     */
    mapping(address => mapping(uint256 => Snapshot)) public _votingSnapshots;
    mapping(address => uint256) public _votingSnapshotsCounts;

    /// @dev reference to the Bend governance contract to call (if initialized) on _beforeTokenTransfer
    /// !!! IMPORTANT The Bend governance is considered a trustable contract, being its responsibility
    /// to control all potential reentrancies by calling back the this contract
    ITransferHook public _bendGovernance;

    function _setBendGovernance(ITransferHook bendGovernance) internal virtual {
        _bendGovernance = bendGovernance;
    }
}
