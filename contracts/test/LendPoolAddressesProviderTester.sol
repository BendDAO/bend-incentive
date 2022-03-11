// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
import {ILendPoolAddressesProvider} from "../incentives/interfaces/ILendPoolAddressesProvider.sol";
import {LendPoolTester} from "./LendPoolTester.sol";

contract LendPoolAddressesProviderTester is ILendPoolAddressesProvider {
    address public lendPool;

    constructor() {
        lendPool = address(new LendPoolTester());
    }

    function getLendPool() external view override returns (address) {
        return lendPool;
    }
}
