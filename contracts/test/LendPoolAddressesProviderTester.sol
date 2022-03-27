// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;
import {ILendPoolAddressesProvider} from "../incentives/interfaces/ILendPoolAddressesProvider.sol";
import {LendPoolTester} from "./LendPoolTester.sol";

contract LendPoolAddressesProviderTester is ILendPoolAddressesProvider {
    address public lendPool;

    constructor(address _reverve, address _underlying) {
        LendPoolTester _lendPool = new LendPoolTester();
        _lendPool.registerReserve(_reverve, _underlying);
        lendPool = address(_lendPool);
    }

    function getLendPool() external view override returns (address) {
        return lendPool;
    }

    function getNFTOracle() external view override returns (address) {
        return 0x0000000000000000000000000000000000000000;
    }
}
